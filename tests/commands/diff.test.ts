import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StateManager } from '../../src/state/manager.js';

describe('pxs diff', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-diff-'));
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

  function seedFeatureWithPlan() {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'my-feat',
      type: 'feat',
      branch: 'feat/my-feat',
      phase: 'implementing',
      total_tasks: 3,
      current_task: 2,
      tasks: [
        { name: 'Setup database', status: 'complete' },
        { name: 'Add API endpoint', status: 'in_progress' },
        { name: 'Write tests', status: 'pending' },
      ],
    });

    const plan = `# Implementation Plan: my-feat

> type: feat
> branch: feat/my-feat
> total_tasks: 3

## Task 1: Setup database
- **Files**:
  - \`src/db.ts\` (new)
- **Description**: Create database schema

## Task 2: Add API endpoint
- **Files**:
  - \`src/routes.ts\` (modify)
- **Description**: Add REST endpoint

## Task 3: Write tests
- **Files**:
  - \`tests/api.test.ts\` (new)
- **Description**: Unit tests
`;
    fs.writeFileSync(path.join(tmpDir, '.workflow', 'plans', 'my-feat.md'), plan);
  }

  it('shows task breakdown with statuses', async () => {
    seedFeatureWithPlan();

    const { diffCommand } = await import('../../src/commands/diff.js');
    // Should not throw
    await diffCommand('my-feat');
  });

  it('errors on non-existent feature', async () => {
    const { diffCommand } = await import('../../src/commands/diff.js');
    // Returns early with error message (does not throw)
    await diffCommand('nonexistent');
  });

  it('errors when plan is missing', async () => {
    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'no-plan',
      type: 'feat',
      branch: '',
      phase: 'implementing',
      total_tasks: 0,
      current_task: 0,
      tasks: [],
    });

    const { diffCommand } = await import('../../src/commands/diff.js');
    await diffCommand('no-plan');
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

    const { diffCommand } = await import('../../src/commands/diff.js');
    await expect(diffCommand('early')).rejects.toThrow(/cannot run in phase/i);
  });
});
