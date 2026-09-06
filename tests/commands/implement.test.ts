import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import inquirer from 'inquirer';
import { StateManager } from '../../src/state/manager.js';
import * as git from '../../src/git/operations.js';

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock git operations
vi.mock('../../src/git/operations.js', () => ({
  gitBranch: vi.fn(),
  gitCheckout: vi.fn(),
  gitCurrentBranch: vi.fn(),
  gitCommit: vi.fn(),
  gitDiff: vi.fn(),
  gitDiffBranch: vi.fn(),
  gitDiffStat: vi.fn(),
  gitMerge: vi.fn(),
  gitResetHard: vi.fn(),
  gitRevParseHead: vi.fn(),
  gitStashPushAll: vi.fn(),
  gitStatus: vi.fn(),
}));

// Mock backends — keyed by name so the implementer (claude) and an
// independent codex reviewer can be told apart
const mockBackend = {
  name: 'claude',
  isAvailable: vi.fn(),
  execute: vi.fn(),
  resume: vi.fn(),
};
const mockCodex = {
  name: 'codex',
  isAvailable: vi.fn(),
  execute: vi.fn(),
  resume: vi.fn(),
};

vi.mock('../../src/backends/factory.js', () => ({
  createBackend: (name: string) => (name === 'codex' ? mockCodex : mockBackend),
}));

const okResult = (output: string, sessionId: string) => ({
  output,
  sessionId,
  exitCode: 0,
  stderr: '',
  raw: output,
  costUsd: 0.05,
  durationMs: 1200,
});

describe('pxs implement', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-impl-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);

    // Reset mock defaults
    vi.mocked(inquirer.prompt).mockReset().mockResolvedValue({ choice: 'approve' });
    mockBackend.isAvailable.mockReset().mockResolvedValue(true);
    mockBackend.execute.mockReset().mockResolvedValue(okResult('implementation output', 'sess-1'));
    mockBackend.resume.mockReset().mockResolvedValue(okResult('## Review\nLooks good!', 'sess-2'));
    mockCodex.isAvailable.mockReset().mockResolvedValue(true);
    mockCodex.execute.mockReset().mockResolvedValue(okResult('## Review\nFinal verdict: PASS', 'codex-1'));
    mockCodex.resume.mockReset();

    vi.mocked(git.gitCurrentBranch).mockReset().mockReturnValue('develop');
    vi.mocked(git.gitDiff).mockReset().mockReturnValue('diff output');
    vi.mocked(git.gitDiffBranch).mockReset().mockReturnValue('branch diff');
    vi.mocked(git.gitDiffStat).mockReset().mockReturnValue(' src/file.ts | 10 +');
    vi.mocked(git.gitRevParseHead).mockReset().mockReturnValue('anchor-sha');
    vi.mocked(git.gitStatus).mockReset().mockReturnValue(' M src/file.ts');
    vi.mocked(git.gitBranch).mockReset();
    vi.mocked(git.gitCheckout).mockReset();
    vi.mocked(git.gitCommit).mockReset();
    vi.mocked(git.gitMerge).mockReset();
    vi.mocked(git.gitResetHard).mockReset();
    vi.mocked(git.gitStashPushAll).mockReset();

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
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'test.md'),
      'Test:\n{test_type}\n{git_diff}\n{task_content}'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // display.error marks the process as failed; keep vitest's own exit clean
    process.exitCode = 0;
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

  it('records the task anchor and completes the task on approve', async () => {
    seedReady('anchor-test');

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('anchor-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('anchor-test')!;
    expect(feature.tasks[0].anchor).toBe('anchor-sha');
    expect(feature.tasks[0].status).toBe('complete');
    // Task diff must be scoped to the anchor, never HEAD~1
    expect(git.gitDiff).toHaveBeenCalledWith('anchor-sha');
  });

  it('propagates backend failure and leaves the task resumable', async () => {
    seedReady('fail-test');
    mockBackend.execute.mockResolvedValue({
      output: '',
      sessionId: '',
      exitCode: 1,
      stderr: 'API quota exceeded',
    });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await expect(
      implementCommand('fail-test', { agents: [], skills: [], text: '' }, { skipReview: true })
    ).rejects.toThrow(/claude CLI failed: exit code 1/);

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('fail-test')!;
    // Resumable: status + anchor persisted before the backend call
    expect(feature.tasks[0].status).toBe('in_progress');
    expect(feature.tasks[0].anchor).toBe('anchor-sha');
    // Nothing was committed for the failed run
    expect(git.gitCommit).not.toHaveBeenCalled();
  });

  it('resumes a review_pending task directly into review without re-implementing', async () => {
    const plan = `# Implementation Plan: resume-test

> type: feat
> branch: feat/resume-test
> total_tasks: 1

## Task 1: Interrupted task
- **Description**: Was committed, review never finished
`;
    fs.writeFileSync(path.join(tmpDir, '.workflow', 'plans', 'resume-test.md'), plan);

    const mgr = new StateManager(tmpDir);
    mgr.upsertFeature({
      feature: 'resume-test',
      type: 'feat',
      branch: 'feat/resume-test',
      base_branch: 'develop',
      phase: 'implementing',
      total_tasks: 1,
      current_task: 1,
      session: { backend: 'claude', id: 'sess-old' },
      tasks: [{ name: 'Interrupted task', status: 'review_pending', anchor: 'anchor-sha' }],
    });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('resume-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    // Implementer session was never resumed — only the fresh-session review ran
    expect(mockBackend.resume).not.toHaveBeenCalled();
    expect(mockBackend.execute).toHaveBeenCalledTimes(1);

    const feature = mgr.getFeature('resume-test')!;
    expect(feature.tasks[0].status).toBe('complete');
  });

  it('guards against an empty diff instead of reviewing stale changes', async () => {
    seedReady('empty-test');
    vi.mocked(git.gitDiff).mockReturnValue('');
    vi.mocked(git.gitStatus).mockReturnValue('');
    vi.mocked(inquirer.prompt).mockResolvedValue({ choice: 'skip' });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('empty-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('empty-test')!;
    expect(feature.tasks[0].status).toBe('skipped');
    // Only the implementation call ran — no review of an empty/stale diff
    expect(mockBackend.execute).toHaveBeenCalledTimes(1);
  });

  it('request-change resets to the anchor and re-runs with feedback', async () => {
    seedReady('redo-test');
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ choice: 'request-change' })
      .mockResolvedValueOnce({ feedback: 'use the shared logger instead' })
      .mockResolvedValueOnce({ choice: 'approve' })
      .mockResolvedValue({ choice: 'approve' });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('redo-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    expect(git.gitResetHard).toHaveBeenCalledWith('anchor-sha');

    // The redo prompt must tell the AI its work was reverted and carry the feedback
    const redoCall = mockBackend.resume.mock.calls.find(
      ([, prompt]) => typeof prompt === 'string' && prompt.includes('Previous Attempt Reverted')
    );
    expect(redoCall).toBeDefined();
    expect(redoCall![1]).toContain('use the shared logger instead');

    const mgr = new StateManager(tmpDir);
    expect(mgr.getFeature('redo-test')!.tasks[0].status).toBe('complete');
  });

  it('--yes runs non-interactively: auto-approve, no prompts, branch kept', async () => {
    seedReady('yes-test');
    vi.mocked(inquirer.prompt).mockRejectedValue(new Error('must not prompt in --yes mode'));

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('yes-test', { agents: [], skills: [], text: '' }, { yes: true });

    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(git.gitMerge).not.toHaveBeenCalled();

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('yes-test')!;
    expect(feature.tasks[0].status).toBe('complete');
    expect(feature.phase).toBe('completed');
  });

  it('accumulates AI cost and duration onto the feature', async () => {
    seedReady('usage-test');

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('usage-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    const mgr = new StateManager(tmpDir);
    const usage = mgr.getFeature('usage-test')!.usage!;
    // implementation run + independent review both report $0.05 / 1200ms
    expect(usage.runs).toBeGreaterThanOrEqual(2);
    expect(usage.cost_usd).toBeCloseTo(0.05 * usage.runs, 5);
    expect(usage.duration_ms).toBe(1200 * usage.runs);
  });

  it('add-test generates tests and re-reviews instead of silently completing', async () => {
    seedReady('addtest-test');
    vi.mocked(inquirer.prompt)
      .mockResolvedValueOnce({ choice: 'add-test' })
      .mockResolvedValueOnce({ choice: 'approve' })
      .mockResolvedValue({ choice: 'approve' });

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('addtest-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    // Test generation ran in the implementer session with the test template
    const testCall = mockBackend.resume.mock.calls.find(
      ([, prompt]) => typeof prompt === 'string' && prompt.includes('Test:')
    );
    expect(testCall).toBeDefined();
    // Review ran twice: initial + after add-test (both fresh sessions)
    expect(mockBackend.execute.mock.calls.length).toBeGreaterThanOrEqual(3);

    const mgr = new StateManager(tmpDir);
    expect(mgr.getFeature('addtest-test')!.tasks[0].status).toBe('complete');
  });

  it('reviews in a read-only session while the implementer keeps write access', async () => {
    seedReady('readonly-test');

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('readonly-test', { agents: [], skills: [], text: '' }, { skipReview: true });

    const [implementCall, reviewCall] = mockBackend.execute.mock.calls;
    expect(implementCall[0]).toContain('Implement:');
    expect(implementCall[1]).not.toHaveProperty('readOnly');
    expect(reviewCall[0]).toContain('Review:');
    expect(reviewCall[1]).toEqual(expect.objectContaining({ readOnly: true }));
  });

  it('--review-mode codex reviews on codex while implementing on claude', async () => {
    seedReady('codex-review');

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand(
      'codex-review',
      { agents: [], skills: [], text: '' },
      { skipReview: true, reviewMode: 'codex' }
    );

    // Implementer: claude only. Reviewer: codex, fresh + read-only, never resumed.
    expect(mockBackend.execute).toHaveBeenCalledTimes(1);
    expect(mockCodex.execute).toHaveBeenCalledTimes(1);
    expect(mockCodex.execute.mock.calls[0][1]).toEqual(expect.objectContaining({ readOnly: true }));
    expect(mockCodex.resume).not.toHaveBeenCalled();

    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('codex-review')!;
    expect(feature.session?.backend).toBe('claude');
    expect(feature.tasks[0].status).toBe('complete');
    const review = fs.readFileSync(path.join(tmpDir, '.workflow', 'reviews', 'codex-review-task-1.md'), 'utf-8');
    expect(review).toContain('Final verdict: PASS');
  });

  it('passes --review-model and --review-effort to the reviewer only', async () => {
    seedReady('flags-test');

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand(
      'flags-test',
      { agents: [], skills: [], text: '' },
      { skipReview: true, reviewMode: 'codex', reviewModel: 'gpt-5.5', reviewEffort: 'high' }
    );

    expect(mockCodex.execute.mock.calls[0][1]).toEqual(
      expect.objectContaining({ model: 'gpt-5.5', effort: 'high', readOnly: true })
    );
    expect(mockBackend.execute.mock.calls[0][1]).not.toHaveProperty('model');
  });

  it('honors the per-feature reviewer choice recorded by pxs new', async () => {
    seedReady('feature-choice');
    const mgr = new StateManager(tmpDir);
    const seeded = mgr.getFeature('feature-choice')!;
    seeded.review = { mode: 'codex', effort: 'xhigh' };
    mgr.upsertFeature(seeded);

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('feature-choice', { agents: [], skills: [], text: '' }, { skipReview: true });

    expect(mockCodex.execute).toHaveBeenCalledTimes(1);
    expect(mockCodex.execute.mock.calls[0][1]).toEqual(expect.objectContaining({ effort: 'xhigh' }));
  });

  it('aborts before implementing when the reviewer backend is unavailable', async () => {
    seedReady('no-codex');
    mockCodex.isAvailable.mockResolvedValue(false);

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('no-codex', { agents: [], skills: [], text: '' }, { reviewMode: 'codex' });

    expect(process.exitCode).toBe(1);
    expect(mockBackend.execute).not.toHaveBeenCalled();
    expect(git.gitBranch).not.toHaveBeenCalled();
    const mgr = new StateManager(tmpDir);
    expect(mgr.getFeature('no-codex')!.phase).toBe('ready_to_implement');
  });

  it('rejects an unknown review mode before any AI run', async () => {
    seedReady('bad-mode');

    const { implementCommand } = await import('../../src/commands/implement.js');
    await expect(
      implementCommand('bad-mode', { agents: [], skills: [], text: '' }, { reviewMode: 'gemini' })
    ).rejects.toThrow(/valid: agent, codex/);
    expect(mockBackend.execute).not.toHaveBeenCalled();
  });

  it('--yes stops with exit 1 when the reviewer returns NEEDS_CHANGES', async () => {
    seedReady('needs-changes');
    mockBackend.execute
      .mockResolvedValueOnce(okResult('implementation output', 'sess-1'))
      .mockResolvedValueOnce(okResult('Critical: missing null check\nFinal verdict: NEEDS_CHANGES', 'rev-1'));
    vi.mocked(inquirer.prompt).mockRejectedValue(new Error('must not prompt in --yes mode'));

    const { implementCommand } = await import('../../src/commands/implement.js');
    await implementCommand('needs-changes', { agents: [], skills: [], text: '' }, { yes: true });

    expect(process.exitCode).toBe(1);
    expect(git.gitMerge).not.toHaveBeenCalled();
    const mgr = new StateManager(tmpDir);
    const feature = mgr.getFeature('needs-changes')!;
    expect(feature.tasks[0].status).toBe('review_pending');
    expect(feature.phase).toBe('implementing');
    const review = fs.readFileSync(path.join(tmpDir, '.workflow', 'reviews', 'needs-changes-task-1.md'), 'utf-8');
    expect(review).toContain('NEEDS_CHANGES');
  });
});
