import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/manager.js';

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
});
