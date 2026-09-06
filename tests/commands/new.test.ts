import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import inquirer from 'inquirer';
import { StateManager } from '../../src/state/manager.js';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock backends — the reviewer prompt only appears when codex is installed
const mockClaude = { name: 'claude', isAvailable: vi.fn(), execute: vi.fn(), resume: vi.fn() };
const mockCodex = { name: 'codex', isAvailable: vi.fn(), execute: vi.fn(), resume: vi.fn() };
vi.mock('../../src/backends/factory.js', () => ({
  createBackend: (name: string) => (name === 'codex' ? mockCodex : mockClaude),
}));

vi.mock('../../src/discovery/models.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/discovery/models.js')>();
  return {
    ...actual,
    codexModelChoices: () => [
      { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol', efforts: ['low', 'high', 'ultra'] },
      { id: 'gpt-5.5', label: 'gpt-5.5', efforts: ['low', 'medium', 'high', 'xhigh'] },
    ],
  };
});

describe('pxs new (blank spec)', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-new-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    // Setup .workflow structure
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'templates'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'config.yaml'),
      'project:\n  name: test\n  language: typescript\n  framework: node\ngit:\n  convention: conventional\nbackend:\n  default: claude\ntest:\n  strategy: none\n  type: unit\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'templates', 'spec-template.md'),
      '# Feature: <name>\n\n## Context\n\n## Requirements\n\n## Constraints\n\n## Notes\n'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.mocked(inquirer.prompt).mockReset();
    mockCodex.isAvailable.mockReset().mockResolvedValue(false);
    mockClaude.isAvailable.mockReset().mockResolvedValue(true);
  });

  it('creates blank spec from template', async () => {
    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('test-feature', {});

    const specPath = path.join(tmpDir, '.workflow', 'specs', 'test-feature.md');
    expect(fs.existsSync(specPath)).toBe(true);

    const content = fs.readFileSync(specPath, 'utf-8');
    expect(content).toContain('# Feature: test-feature');
  });

  it('updates state.yaml after creation', async () => {
    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('test-feature', {});

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('test-feature');
    expect(feature).toBeDefined();
    expect(feature!.phase).toBe('spec_created');
  });
});

describe('pxs new (reviewer choice)', () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-new-review-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    fs.mkdirSync(path.join(tmpDir, '.workflow', 'specs'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'config.yaml'),
      'project:\n  name: test\nbackend:\n  default: claude\nreview:\n  mode: agent\n  codex:\n    effort: high\n'
    );

    vi.mocked(inquirer.prompt).mockReset();
    mockCodex.isAvailable.mockReset().mockResolvedValue(true);
    mockClaude.isAvailable.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function promptChoices(): Array<Array<{ name: string; value: string }>> {
    return vi.mocked(inquirer.prompt).mock.calls.map((call) => {
      const questions = call[0] as Array<{ choices?: Array<{ name: string; value: string }> }>;
      return questions[0].choices ?? [];
    });
  }

  it('asks mode, model and effort from lists when codex is installed and stores the choice', async () => {
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ mode: 'codex' })
      .mockResolvedValueOnce({ model: 'gpt-5.6-sol' })
      .mockResolvedValueOnce({ effort: 'ultra' });

    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('with-codex', {});

    expect(inquirer.prompt).toHaveBeenCalledTimes(3);
    const [modeChoices, modelChoices, effortChoices] = promptChoices();
    expect(modeChoices.map((c) => c.value)).toEqual(['agent', 'codex']);
    // Models are picked from a list: default, the CLI's models, then a custom escape hatch
    expect(modelChoices.map((c) => c.value)).toEqual(['', 'gpt-5.6-sol', 'gpt-5.5', '__custom__']);
    expect(modelChoices[0].name).toBe('(default)');
    // Effort levels follow the picked model
    expect(effortChoices.map((c) => c.value)).toEqual(['', 'low', 'high', 'ultra']);
    expect(effortChoices[0].name).toBe('(default: high)');

    const feature = new StateManager(tmpDir).getFeature('with-codex')!;
    expect(feature.review).toEqual({ mode: 'codex', model: 'gpt-5.6-sol', effort: 'ultra' });
  });

  it('offers claude aliases for agent mode and keeps empty picks as defaults', async () => {
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ mode: 'agent' })
      .mockResolvedValueOnce({ model: '' })
      .mockResolvedValueOnce({ effort: 'xhigh' });

    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('agent-pick', {});

    const [, modelChoices, effortChoices] = promptChoices();
    expect(modelChoices.map((c) => c.value)).toEqual(['', 'fable', 'opus', 'sonnet', 'haiku', '__custom__']);
    expect(effortChoices.map((c) => c.value)).toEqual(['', 'low', 'medium', 'high', 'xhigh', 'max']);

    const feature = new StateManager(tmpDir).getFeature('agent-pick')!;
    expect(feature.review).toEqual({ mode: 'agent', effort: 'xhigh' });
  });

  it('lets the user type a model id when it is not in the list', async () => {
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ mode: 'codex' })
      .mockResolvedValueOnce({ model: '__custom__' })
      .mockResolvedValueOnce({ model: ' gpt-5.4-mini ' })
      .mockResolvedValueOnce({ effort: '' });

    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('custom-model', {});

    expect(inquirer.prompt).toHaveBeenCalledTimes(4);
    const feature = new StateManager(tmpDir).getFeature('custom-model')!;
    expect(feature.review).toEqual({ mode: 'codex', model: 'gpt-5.4-mini' });
  });

  it('does not ask when codex is not installed', async () => {
    mockCodex.isAvailable.mockResolvedValue(false);

    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('no-codex', {});

    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(new StateManager(tmpDir).getFeature('no-codex')!.review).toBeUndefined();
  });

  it('does not ask outside a TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('no-tty', {});

    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(new StateManager(tmpDir).getFeature('no-tty')!.review).toBeUndefined();
  });

  it('stores flags without prompting', async () => {
    const { newCommand } = await import('../../src/commands/new.js');
    await newCommand('flagged', { reviewMode: 'codex', reviewEffort: 'high' });

    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(new StateManager(tmpDir).getFeature('flagged')!.review).toEqual({ mode: 'codex', effort: 'high' });
  });

  it('rejects an unknown --review-mode', async () => {
    const { newCommand } = await import('../../src/commands/new.js');
    await expect(newCommand('bad-flag', { reviewMode: 'gemini' })).rejects.toThrow(/valid: agent, codex/);
  });
});
