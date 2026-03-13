import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/manager.js';

describe('pxs reset', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-reset-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    fs.mkdirSync(path.join(tmpDir, '.workflow', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'plans'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'config.yaml'),
      'project:\n  name: test\n  language: typescript\n  framework: node\ngit:\n  convention: conventional\nbackend:\n  default: claude\ntest:\n  strategy: none\n  type: unit\n'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedFeature(phase: string, tasks: Array<{ name: string; status: string }> = []) {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'test-feat',
      type: 'feat',
      branch: 'feat/test-feat',
      phase: phase as any,
      total_tasks: tasks.length,
      current_task: 1,
      session: { backend: 'claude', id: 'sess-123' },
      tasks: tasks as any,
    });
  }

  it('resets implementing feature to spec_created', async () => {
    seedFeature('implementing', [
      { name: 'task-1', status: 'complete' },
      { name: 'task-2', status: 'in_progress' },
    ]);

    const { resetCommand } = await import('../../src/commands/reset.js');
    await resetCommand('test-feat', {});

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('test-feat')!;
    expect(feature.phase).toBe('spec_created');
    expect(feature.tasks).toEqual([]);
    expect(feature.total_tasks).toBe(0);
    expect(feature.session).toBeUndefined();
  });

  it('resets to ready_to_implement and clears task statuses', async () => {
    seedFeature('implementing', [
      { name: 'task-1', status: 'complete' },
      { name: 'task-2', status: 'in_progress' },
    ]);

    const { resetCommand } = await import('../../src/commands/reset.js');
    await resetCommand('test-feat', { to: 'ready_to_implement' });

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('test-feat')!;
    expect(feature.phase).toBe('ready_to_implement');
    expect(feature.tasks).toHaveLength(2);
    expect(feature.tasks.every((t) => t.status === 'pending')).toBe(true);
    expect(feature.current_task).toBe(0);
  });

  it('rejects invalid target phase', async () => {
    seedFeature('implementing');

    const { resetCommand } = await import('../../src/commands/reset.js');
    await resetCommand('test-feat', { to: 'merged' });

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('test-feat')!;
    expect(feature.phase).toBe('implementing'); // unchanged
  });

  it('errors on non-existent feature', async () => {
    const { resetCommand } = await import('../../src/commands/reset.js');
    // Should not throw, just prints error
    await resetCommand('nonexistent', {});
  });

  it('resets to clarifying phase', async () => {
    seedFeature('plan_pending_approval', [
      { name: 'task-1', status: 'pending' },
    ]);

    const { resetCommand } = await import('../../src/commands/reset.js');
    await resetCommand('test-feat', { to: 'clarifying' });

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('test-feat')!;
    expect(feature.phase).toBe('clarifying');
    expect(feature.tasks).toEqual([]);
  });
});
