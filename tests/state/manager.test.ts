import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/manager.js';
import type { FeatureState } from '../../src/state/types.js';

describe('StateManager', () => {
  let tmpDir: string;
  let mgr: StateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-test-'));
    const workflowDir = path.join(tmpDir, '.workflow');
    fs.mkdirSync(workflowDir, { recursive: true });
    mgr = new StateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects workflow existence', () => {
    expect(mgr.workflowExists()).toBe(true);
  });

  it('reads empty state when no state file exists', () => {
    const state = mgr.readState();
    expect(state.features).toEqual([]);
  });

  it('writes and reads state', () => {
    const feature: FeatureState = {
      feature: 'test-feature',
      type: 'feat',
      branch: 'feat/test-feature',
      phase: 'spec_created',
      total_tasks: 2,
      current_task: 0,
      tasks: [
        { name: 'Task 1', status: 'pending' },
        { name: 'Task 2', status: 'pending' },
      ],
    };

    mgr.upsertFeature(feature);

    const retrieved = mgr.getFeature('test-feature');
    expect(retrieved).toBeDefined();
    expect(retrieved!.feature).toBe('test-feature');
    expect(retrieved!.phase).toBe('spec_created');
    expect(retrieved!.tasks).toHaveLength(2);
  });

  it('updates existing feature', () => {
    const feature: FeatureState = {
      feature: 'test-feature',
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    };

    mgr.upsertFeature(feature);
    feature.phase = 'implementing';
    mgr.upsertFeature(feature);

    const state = mgr.readState();
    expect(state.features).toHaveLength(1);
    expect(state.features[0].phase).toBe('implementing');
  });

  it('enforces phase guards', () => {
    const feature: FeatureState = {
      feature: 'test-feature',
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    };

    mgr.upsertFeature(feature);

    // implement is only allowed in ready_to_implement or implementing
    expect(() => mgr.checkPhaseGuard('implement', 'test-feature')).toThrow();
  });

  it('allows commands with no phase restriction', () => {
    const feature: FeatureState = {
      feature: 'test-feature',
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    };

    mgr.upsertFeature(feature);

    // status has no phase restriction
    expect(() => mgr.checkPhaseGuard('status', 'test-feature')).not.toThrow();
  });

  it('throws for missing feature on phase guard check', () => {
    expect(() => mgr.checkPhaseGuard('refine', 'nonexistent')).toThrow('not found');
  });

  it('generates correct paths', () => {
    expect(mgr.specPath('my-feat')).toBe(path.join(tmpDir, '.workflow', 'specs', 'my-feat.md'));
    expect(mgr.planPath('my-feat')).toBe(path.join(tmpDir, '.workflow', 'plans', 'my-feat.md'));
    expect(mgr.reviewPath('my-feat', 2)).toBe(path.join(tmpDir, '.workflow', 'reviews', 'my-feat-task-2.md'));
  });

  it('writes state atomically without leaving temp files', () => {
    mgr.upsertFeature({
      feature: 'atomic-test',
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    });

    const files = fs.readdirSync(path.join(tmpDir, '.workflow'));
    expect(files).toContain('state.yaml');
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('rejects a state file with an unknown phase, naming the field', () => {
    fs.writeFileSync(
      mgr.statePath,
      'features:\n  - feature: broken\n    phase: implmenting\n    tasks: []\n'
    );
    expect(() => mgr.readState()).toThrow(/unknown phase "implmenting"/);
    expect(() => mgr.readState()).toThrow(/valid: spec_created/);
  });

  it('rejects a task with an unknown status, naming the task', () => {
    fs.writeFileSync(
      mgr.statePath,
      'features:\n  - feature: broken\n    phase: implementing\n    tasks:\n      - name: T1\n        status: done\n'
    );
    expect(() => mgr.readState()).toThrow(/task "T1" has unknown status "done"/);
  });

  it('rejects invalid YAML with a clear pointer to the file', () => {
    fs.writeFileSync(mgr.statePath, 'features: [unclosed');
    expect(() => mgr.readState()).toThrow(/Corrupt state file/);
  });

  it('merges config defaults for hand-edited configs with missing keys', () => {
    fs.writeFileSync(mgr.configPath, 'project:\n  name: partial\n');
    const config = mgr.readConfig();
    expect(config.project.name).toBe('partial');
    expect(config.backend.default).toBe('claude');
    expect(config.test.strategy).toBe('none');
    expect(config.git.convention).toBe('conventional');
  });
});

describe('StateManager review settings', () => {
  let tmpDir: string;
  let mgr: StateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-review-state-'));
    fs.mkdirSync(path.join(tmpDir, '.workflow'), { recursive: true });
    mgr = new StateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fills nested review defaults for configs without a review section', () => {
    fs.writeFileSync(mgr.configPath, 'project:\n  name: partial\n');
    const config = mgr.readConfig();
    expect(config.review).toEqual({
      mode: 'agent',
      agent: { model: '', effort: '' },
      codex: { model: '', effort: '' },
    });
  });

  it('keeps sub-defaults when only part of the review section is set', () => {
    fs.writeFileSync(
      mgr.configPath,
      'project:\n  name: partial\nreview:\n  mode: codex\n  codex:\n    effort: high\n'
    );
    const config = mgr.readConfig();
    expect(config.review.mode).toBe('codex');
    expect(config.review.codex).toEqual({ model: '', effort: 'high' });
    expect(config.review.agent).toEqual({ model: '', effort: '' });
  });

  it('rejects a feature with an unknown review mode', () => {
    fs.writeFileSync(
      mgr.statePath,
      'features:\n  - feature: broken\n    phase: spec_created\n    tasks: []\n    review:\n      mode: gemini\n'
    );
    expect(() => mgr.readState()).toThrow(/unknown review mode "gemini"/);
    expect(() => mgr.readState()).toThrow(/valid: agent, codex/);
  });

  it('round-trips a per-feature reviewer choice', () => {
    mgr.upsertFeature({
      feature: 'f',
      type: 'feat',
      branch: '',
      phase: 'spec_created',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
      review: { mode: 'codex', model: 'gpt-5.5', effort: 'high' },
    });
    expect(mgr.getFeature('f')!.review).toEqual({ mode: 'codex', model: 'gpt-5.5', effort: 'high' });
  });
});
