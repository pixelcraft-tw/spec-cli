import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/manager.js';

// Mock inquirer — each prompt call consumes the next resolved value
const mockPrompt = vi.fn();
vi.mock('inquirer', () => ({
  default: { prompt: mockPrompt },
}));

// Mock backend
const mockBackend = {
  name: 'claude',
  isAvailable: vi.fn(),
  execute: vi.fn(),
  resume: vi.fn(),
};

vi.mock('../../src/backends/factory.js', () => ({
  createBackend: () => mockBackend,
}));

describe('pxs refine', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-refine-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    // Reset mocks
    mockBackend.isAvailable.mockResolvedValue(true);
    mockBackend.execute.mockResolvedValue({
      output: '# Clarification questions\n1. What scope?',
      sessionId: 'sess-1',
      exitCode: 0,
    });
    mockBackend.resume.mockResolvedValue({
      output: '# Refined output',
      sessionId: 'sess-2',
      exitCode: 0,
    });

    fs.mkdirSync(path.join(tmpDir, '.workflow', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'plans'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'config.yaml'),
      'project:\n  name: test\n  language: typescript\n  framework: node\ngit:\n  convention: conventional\nbackend:\n  default: claude\ntest:\n  strategy: none\n  type: unit\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'clarify.md'),
      'Clarify the spec:\n{spec_content}'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'refine.md'),
      'Refine the spec:\n{spec_content}'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedSpec(name: string) {
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'specs', `${name}.md`),
      `# Feature: ${name}\n\n## Requirements\n1. Do something\n`
    );
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: name,
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    });
  }

  it('errors when spec file does not exist', async () => {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'ghost',
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    });

    const { refineCommand } = await import('../../src/commands/refine.js');
    await refineCommand('ghost', { agents: [], skills: [], text: '' }, {});
  });

  it('errors when backend is unavailable', async () => {
    seedSpec('test-feat');
    mockBackend.isAvailable.mockResolvedValue(false);

    const { refineCommand } = await import('../../src/commands/refine.js');
    await refineCommand('test-feat', { agents: [], skills: [], text: '' }, {});
  });

  it('rejects feature in wrong phase', async () => {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'done-feat',
      type: 'feat',
      branch: '',
      phase: 'implementing',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    });

    const { refineCommand } = await import('../../src/commands/refine.js');
    await expect(
      refineCommand('done-feat', { agents: [], skills: [], text: '' }, {})
    ).rejects.toThrow(/cannot run in phase/i);
  });

  it('skips clarify when --skip-clarify and progresses through refine + plan', async () => {
    seedSpec('skip-feat');

    // execute → refine result (no session yet)
    mockBackend.execute.mockResolvedValueOnce({
      output: '# Feature: skip-feat\n## Requirements\n1. Refined',
      sessionId: 'sess-2',
      exitCode: 0,
    });
    // resume → plan decomposition
    mockBackend.resume.mockResolvedValueOnce({
      output: '# Implementation Plan: skip-feat\n\n> type: feat\n> branch: feat/skip-feat\n> total_tasks: 1\n\n## Task 1: Do thing\n- **Description**: Do it',
      sessionId: 'sess-3',
      exitCode: 0,
    });

    // inquirer: approveSpec → approve, approvePlan → approve
    mockPrompt
      .mockResolvedValueOnce({ approveSpec: 'approve' })
      .mockResolvedValueOnce({ approvePlan: 'approve' });

    const { refineCommand } = await import('../../src/commands/refine.js');
    await refineCommand('skip-feat', { agents: [], skills: [], text: '' }, { skipClarify: true });

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('skip-feat')!;
    expect(feature.phase).toBe('ready_to_implement');
    expect(feature.tasks.length).toBeGreaterThan(0);
  });

  it('pauses when user declines to proceed after clarification', async () => {
    seedSpec('pause-feat');

    // inquirer: proceed → false
    mockPrompt.mockResolvedValueOnce({ proceed: false });

    const { refineCommand } = await import('../../src/commands/refine.js');
    await refineCommand('pause-feat', { agents: [], skills: [], text: '' }, {});

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('pause-feat')!;
    expect(feature.phase).toBe('clarifying');
  });
});
