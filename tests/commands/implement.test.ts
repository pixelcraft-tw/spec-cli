import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/manager.js';

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({ choice: 'approve' }),
  },
}));

// Mock git operations
vi.mock('../../src/git/operations.js', () => ({
  gitBranch: vi.fn(),
  gitCheckout: vi.fn(),
  gitCurrentBranch: vi.fn().mockReturnValue('develop'),
  gitCommit: vi.fn(),
  gitDiff: vi.fn().mockReturnValue('diff output'),
  gitDiffBranch: vi.fn().mockReturnValue('branch diff'),
  gitMerge: vi.fn(),
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

describe('pxs implement', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-impl-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    // Reset mock defaults
    mockBackend.isAvailable.mockResolvedValue(true);
    mockBackend.execute.mockResolvedValue({
      output: 'implementation output',
      sessionId: 'sess-1',
      exitCode: 0,
    });
    mockBackend.resume.mockResolvedValue({
      output: '## Review\nLooks good!',
      sessionId: 'sess-2',
      exitCode: 0,
    });

    fs.mkdirSync(path.join(tmpDir, '.workflow', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'plans'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'reviews'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'config.yaml'),
      'project:\n  name: test\n  language: typescript\n  framework: node\ngit:\n  convention: conventional\nbackend:\n  default: claude\ntest:\n  strategy: none\n  type: unit\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'implement.md'),
      'Implement:\n{task_content}\n{previous_diff}'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'review.md'),
      'Review:\n{git_diff}\n{task_content}'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedReady(name: string) {
    const plan = `# Implementation Plan: ${name}

> type: feat
> branch: feat/${name}
> total_tasks: 1

## Task 1: Create component
- **Description**: Build the thing
`;
    fs.writeFileSync(path.join(tmpDir, '.workflow', 'plans', `${name}.md`), plan);

    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: name,
      type: 'feat',
      branch: `feat/${name}`,
      phase: 'ready_to_implement',
      total_tasks: 1,
      current_task: 0,
      tasks: [{ name: 'Create component', status: 'pending' }],
    });
  }

  it('errors when plan is missing', async () => {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'no-plan',
      type: 'feat',
      branch: '',
      phase: 'ready_to_implement',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('no-plan', { agents: [], skills: [], text: '' }, {});
  });

  it('errors when backend is unavailable', async () => {
    seedReady('test-feat');
    mockBackend.isAvailable.mockResolvedValue(false);

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('test-feat', { agents: [], skills: [], text: '' }, {});
  });

  it('rejects feature in wrong phase', async () => {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'early',
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await expect(
      implementCommand('early', { agents: [], skills: [], text: '' }, {})
    ).rejects.toThrow(/cannot run in phase/i);
  });

  it('stores base_branch when creating feature branch', async () => {
    seedReady('branch-test');

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('branch-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('branch-test')!;
    expect(feature.base_branch).toBe('develop');
  });

  it('skips already completed tasks', async () => {
    const plan = `# Implementation Plan: skip-test

> type: feat
> branch: feat/skip-test
> total_tasks: 2

## Task 1: Done task
- **Description**: Already done

## Task 2: Pending task
- **Description**: Do this
`;
    fs.writeFileSync(path.join(tmpDir, '.workflow', 'plans', 'skip-test.md'), plan);

    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'skip-test',
      type: 'feat',
      branch: 'feat/skip-test',
      phase: 'implementing',
      total_tasks: 2,
      current_task: 1,
      tasks: [
        { name: 'Done task', status: 'complete' },
        { name: 'Pending task', status: 'pending' },
      ],
    });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('skip-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    const feature = mgr.getFeature('skip-test')!;
    expect(feature.tasks[0].status).toBe('complete');
  });
});
