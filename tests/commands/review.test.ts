import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/manager.js';

// Mock git operations (only used by the --run path)
vi.mock('../../src/git/operations.js', () => ({
  gitDiffBranch: vi.fn().mockReturnValue('branch diff'),
}));

// Mock backends — keyed by name so the codex reviewer can be told apart
const mockBackend = {
  name: 'claude',
  isAvailable: vi.fn().mockResolvedValue(true),
  execute: vi.fn().mockResolvedValue({ output: '## Final Review\nPASS', sessionId: 'rev-1', exitCode: 0 }),
  resume: vi.fn(),
};
const mockCodex = {
  name: 'codex',
  isAvailable: vi.fn().mockResolvedValue(true),
  execute: vi.fn().mockResolvedValue({ output: '## Final Review\nFinal verdict: PASS', sessionId: 'codex-1', exitCode: 0 }),
  resume: vi.fn(),
};

vi.mock('../../src/backends/factory.js', () => ({
  createBackend: (name: string) => (name === 'codex' ? mockCodex : mockBackend),
}));

describe('pxs review', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-review-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    fs.mkdirSync(path.join(tmpDir, '.workflow', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'reviews'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'config.yaml'),
      'project:\n  name: test\n  language: typescript\n  framework: node\ngit:\n  convention: conventional\nbackend:\n  default: claude\ntest:\n  strategy: none\n  type: unit\n'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedFeature(phase: string, tasks: Array<{ name: string; status: string }>) {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'my-feat',
      type: 'feat',
      branch: 'feat/my-feat',
      phase: phase as any,
      total_tasks: tasks.length,
      current_task: 1,
      tasks: tasks as any,
    });
  }

  it('shows no reviews found when none exist', async () => {
    seedFeature('implementing', [{ name: 'task-1', status: 'in_progress' }]);

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', {});
  });

  it('shows specific task review by step number', async () => {
    seedFeature('implementing', [{ name: 'task-1', status: 'review_pending' }]);
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'reviews', 'my-feat-task-1.md'),
      '## Review\nLooks good!'
    );

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', { step: 1 });
  });

  it('errors on missing task review', async () => {
    seedFeature('implementing', [{ name: 'task-1', status: 'in_progress' }]);

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', { step: 5 });
  });

  it('shows summary of all tasks', async () => {
    seedFeature('implementing', [
      { name: 'task-1', status: 'complete' },
      { name: 'task-2', status: 'in_progress' },
    ]);
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'reviews', 'my-feat-task-1.md'),
      '## Review\nTask 1 done'
    );

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', { summary: true });
  });

  it('shows final review for completed feature', async () => {
    seedFeature('completed', [{ name: 'task-1', status: 'complete' }]);
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'reviews', 'my-feat-final.md'),
      '## Final Review\nAll good!'
    );

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', {});
  });

  it('errors on non-existent feature', async () => {
    const { reviewCommand } = await import('../../src/commands/review.js');
    await expect(reviewCommand('nonexistent', {})).rejects.toThrow(/not found/i);
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

    const { reviewCommand } = await import('../../src/commands/review.js');
    await expect(reviewCommand('early', {})).rejects.toThrow(/cannot run in phase/i);
  });

  it('--run executes an independent expert review and saves it', async () => {
    mockBackend.execute.mockClear();
    mockBackend.resume.mockClear();
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'final-review.md'),
      'Final review:\n{branch_diff}\n{spec_content}\n{plan_content}\n{docs_content}'
    );
    seedFeature('completed', [{ name: 'task-1', status: 'complete' }]);

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', { run: true });

    // Independent reviewer must use a fresh session (execute), never resume
    expect(mockBackend.execute).toHaveBeenCalledTimes(1);
    expect(mockBackend.resume).not.toHaveBeenCalled();

    const finalReviewPath = path.join(tmpDir, '.workflow', 'reviews', 'my-feat-final.md');
    expect(fs.existsSync(finalReviewPath)).toBe(true);
    expect(fs.readFileSync(finalReviewPath, 'utf-8')).toContain('PASS');
  });

  it('--run --review-mode codex uses the codex reviewer read-only', async () => {
    mockBackend.execute.mockClear();
    mockCodex.execute.mockClear();
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'final-review.md'),
      'Final review:\n{branch_diff}\n{spec_content}\n{plan_content}\n{docs_content}'
    );
    seedFeature('completed', [{ name: 'task-1', status: 'complete' }]);

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', { run: true, reviewMode: 'codex', reviewEffort: 'high' });

    expect(mockBackend.execute).not.toHaveBeenCalled();
    expect(mockCodex.execute).toHaveBeenCalledTimes(1);
    expect(mockCodex.execute.mock.calls[0][1]).toEqual(
      expect.objectContaining({ readOnly: true, effort: 'high' })
    );
    expect(mockCodex.resume).not.toHaveBeenCalled();

    const finalReviewPath = path.join(tmpDir, '.workflow', 'reviews', 'my-feat-final.md');
    expect(fs.readFileSync(finalReviewPath, 'utf-8')).toContain('Final verdict: PASS');
  });

  it('--run fails fast when the chosen reviewer CLI is missing', async () => {
    mockCodex.isAvailable.mockResolvedValueOnce(false);
    mockCodex.execute.mockClear();
    seedFeature('completed', [{ name: 'task-1', status: 'complete' }]);

    const { reviewCommand } = await import('../../src/commands/review.js');
    await reviewCommand('my-feat', { run: true, reviewMode: 'codex' });

    expect(process.exitCode).toBe(1);
    expect(mockCodex.execute).not.toHaveBeenCalled();
    process.exitCode = 0;
  });
});
