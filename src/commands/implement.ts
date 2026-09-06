import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import { StateManager } from '../state/manager.js';
import { createBackend } from '../backends/factory.js';
import { runPrompt } from '../backends/run.js';
import { parsePlan } from '../parsers/plan.js';
import { assemblePrompt } from '../utils/prompt.js';
import {
  runExpertReview,
  loadDocs,
  resolveReviewer,
  ensureReviewerAvailable,
  describeReviewer,
  type ReviewFlags,
} from '../utils/review.js';
import {
  gitBranch,
  gitCheckout,
  gitCommit,
  gitCurrentBranch,
  gitDiff,
  gitDiffBranch,
  gitDiffStat,
  gitMerge,
  gitResetHard,
  gitRevParseHead,
  gitStashPushAll,
  gitStatus,
} from '../git/operations.js';
import * as display from '../utils/display.js';
import type { FeatureState } from '../state/types.js';

export async function implementCommand(
  name: string,
  args: { agents: string[]; skills: string[]; text: string },
  options: {
    backend?: string;
    test?: string[] | boolean;
    skipReview?: boolean;
    docs?: string[];
    yes?: boolean;
  } & ReviewFlags
): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();
  state.checkPhaseGuard('implement', name);

  const feature = state.getFeature(name)!;
  const config = state.readConfig();
  const backendName = options.backend ?? config.backend.default;
  const backend = createBackend(backendName);
  const autoYes = options.yes === true;

  if (!(await backend.isAvailable())) {
    display.error(`Backend "${backendName}" not available.`);
    return;
  }

  // Independent reviewer: resolved and checked up front so a missing CLI or
  // a bad value fails here — before any branch is created or AI run starts.
  const reviewer = resolveReviewer(config.review, feature.review, options);
  if (!(await ensureReviewerAvailable(reviewer))) return;
  // Tell the user up front exactly which model/effort will judge the work
  const reviewerLabel = describeReviewer(reviewer);
  display.info(`Reviewer: ${reviewerLabel}`);

  if (!autoYes && !process.stdout.isTTY) {
    display.warn('Not running in a TTY — interactive prompts may fail. Use --yes for non-interactive runs.');
  }

  // Read plan
  const planPath = state.planPath(name);
  if (!fs.existsSync(planPath)) {
    display.error(`Plan not found. Run \`pxs refine ${name}\` first.`);
    return;
  }
  const planContent = fs.readFileSync(planPath, 'utf-8');
  const plan = parsePlan(planContent);

  // Pre-flight: create branch if first run
  if (feature.phase === 'ready_to_implement') {
    const baseBranch = gitCurrentBranch();
    const branchName = feature.branch || `${feature.type}/${name}`;
    display.info(`Creating branch: ${branchName} (from ${baseBranch})`);
    try {
      gitBranch(branchName);
    } catch {
      display.warn(`Branch ${branchName} may already exist, checking out...`);
      gitCheckout(branchName);
    }
    feature.phase = 'implementing';
    feature.branch = branchName;
    feature.base_branch = baseBranch;
    state.upsertFeature(feature);
  }

  // Determine test strategy
  const testConfig = parseTestOptions(options.test);
  const baseBranch = feature.base_branch || 'main';
  const docsContent = loadDocs(options.docs);
  const onEvent = display.renderBackendEvent;
  const logsDir = state.logsDir();
  let sessionId = feature.session?.id ?? '';

  // Ensure reviews dir exists once
  fs.mkdirSync(state.reviewsDir(), { recursive: true });

  // Execute tasks
  for (let i = 0; i < feature.tasks.length; i++) {
    const task = feature.tasks[i];
    if (task.status === 'complete' || task.status === 'skipped') continue;

    const taskSpec = plan.tasks[i];
    if (!taskSpec) continue;

    display.heading(`Task ${i + 1}: ${task.name}`);

    // Anchor: captured exactly once per task lifecycle. All of the task's
    // commits are anchor..HEAD — the basis for review diffs, resume, and
    // request-change resets. Never re-captured on resume.
    if (!task.anchor) {
      task.anchor = gitRevParseHead();
    }
    const anchor = task.anchor;

    // Resume handling (spec §10.2): a review_pending task re-enters review
    // directly; an in_progress task that already has commits (interrupted
    // between commit and review) skips re-implementation.
    const resumingReview = task.status === 'review_pending';
    const resumingAfterCommit = task.status === 'in_progress' && safeDiff(anchor).trim().length > 0;
    const needImplementation = !resumingReview && !resumingAfterCommit;

    if (!needImplementation && !resumingReview) {
      display.info('Resuming interrupted task — changes already committed, skipping re-implementation.');
    }

    feature.current_task = i + 1;
    if (!resumingReview) {
      task.status = 'in_progress';
    }
    state.upsertFeature(feature);

    const commitMessage = `${feature.type}(${name}): task-${i + 1} ${task.name}`;

    if (needImplementation) {
      // Build prompt
      const templateName = testConfig.tdd ? 'implement-tdd' : 'implement';
      const prompt = assemblePrompt({
        templateName,
        vars: {
          task_content: taskSpec.raw,
          previous_diff: previousTaskSummary(feature, i, anchor),
        },
        agents: args.agents,
        skills: args.skills,
        extraText: args.text,
      });

      // Execute — a failed CLI run (auth, quota, timeout) throws here.
      // State is resumable: status in_progress + anchor are already persisted.
      const result = await runPrompt(backend, prompt, {
        sessionId: sessionId || undefined,
        onEvent,
        log: { dir: logsDir, label: `${name}-task-${i + 1}-implement` },
      });
      sessionId = result.sessionId;
      feature.session = { backend: backendName, id: sessionId };
      state.upsertFeature(feature);
      state.recordUsage(feature, result);

      commitAll(commitMessage);
    }

    // Task diff is always scoped to the anchor — never HEAD~1 guessing.
    let taskDiff = safeDiff(anchor);

    // Empty-diff guard: the backend reported success but changed nothing.
    // Reviewing here would grade a stale/empty diff — ask the user instead.
    if (needImplementation && !taskDiff.trim()) {
      display.warn('The backend made no code changes for this task.');
      if (autoYes) {
        // Non-interactive runs must fail loudly, not guess
        display.error('Aborting (--yes): a no-change task needs human review. Re-run interactively.');
        return;
      }
      const { choice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'choice',
          message: `Task ${i + 1} produced no changes:`,
          choices: ['retry', 'skip', 'abort'],
        },
      ]);
      if (choice === 'retry') {
        i--;
        continue;
      }
      if (choice === 'skip') {
        task.status = 'skipped';
        state.upsertFeature(feature);
        display.info(`Task ${i + 1} skipped.`);
        continue;
      }
      // abort: leave in_progress; next run resumes here
      display.info('Aborted. Run `pxs implement` again to retry this task.');
      return;
    }

    // Post-hoc tests (if not TDD) — only on a fresh implementation pass
    if (testConfig.postHoc && needImplementation) {
      display.info('Generating tests...');
      const testResult = await generateTests({
        backend, sessionId, testConfig, taskDiff,
        taskRaw: taskSpec.raw,
        commitMessage: `test(${name}): task-${i + 1} ${task.name}`,
        onEvent,
        log: { dir: logsDir, label: `${name}-task-${i + 1}-test` },
      });
      sessionId = testResult.sessionId;
      feature.session = { backend: backendName, id: sessionId };
      state.upsertFeature(feature);
      state.recordUsage(feature, testResult);
      taskDiff = safeDiff(anchor);
    }

    // Review + decision loop. add-test and request-change both loop back
    // into a fresh independent review instead of silently completing.
    reviewLoop: while (true) {
      // Independent AI review — runs on the reviewer's own backend in a FRESH,
      // read-only session (never the implementer's), so the reviewer is not
      // grading its own work. Its session is discarded and must not overwrite
      // `sessionId`, which keeps the implementer context for the next task.
      display.info(`Running independent AI review (${reviewerLabel})...`);
      const review = await runExpertReview({
        ...reviewer,
        templateName: 'review',
        vars: {
          git_diff: taskDiff.trim() ? taskDiff : '(the backend produced no changes on this attempt)',
          task_content: taskSpec.raw,
          docs_content: docsContent,
        },
        agents: args.agents,
        skills: args.skills,
        log: { dir: logsDir, label: `${name}-task-${i + 1}-review` },
        onEvent,
      });
      state.recordUsage(feature, review);
      const reviewOutput = review.output;

      // Save review
      fs.writeFileSync(state.reviewPath(name, i + 1), reviewOutput, 'utf-8');

      task.status = 'review_pending';
      state.upsertFeature(feature);

      // Present to user
      console.log('\n' + reviewOutput + '\n');

      let choice: string;
      if (autoYes) {
        // Non-interactive runs must not rubber-stamp a failing verdict. The
        // task stays review_pending (review saved) and the next interactive
        // run re-enters review directly.
        if (/\bNEEDS_CHANGES\b/.test(reviewOutput)) {
          display.error(
            `--yes: independent reviewer returned NEEDS_CHANGES for task ${i + 1}. ` +
              'Re-run interactively to decide.'
          );
          return;
        }
        display.info('--yes: auto-approving task.');
        choice = 'approve';
      } else {
        ({ choice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'choice',
            message: `Task ${i + 1} review:`,
            choices: ['approve', 'request-change', 'add-test', 'skip'],
          },
        ]));
      }

      switch (choice) {
        case 'approve':
          task.status = 'complete';
          state.upsertFeature(feature);
          display.success(`Task ${i + 1} approved.`);
          break reviewLoop;

        case 'skip':
          task.status = 'skipped';
          state.upsertFeature(feature);
          display.info(`Task ${i + 1} skipped.`);
          break reviewLoop;

        case 'add-test': {
          task.status = 'in_progress';
          state.upsertFeature(feature);
          display.info('Generating additional tests...');
          const result = await generateTests({
            backend, sessionId, testConfig, taskDiff,
            taskRaw: taskSpec.raw,
            commitMessage: `test(${name}): task-${i + 1} ${task.name}`,
            onEvent,
            log: { dir: logsDir, label: `${name}-task-${i + 1}-add-test` },
          });
          sessionId = result.sessionId;
          feature.session = { backend: backendName, id: sessionId };
          state.upsertFeature(feature);
          state.recordUsage(feature, result);
          taskDiff = safeDiff(anchor);
          continue reviewLoop;
        }

        case 'request-change': {
          const { feedback } = await inquirer.prompt([
            {
              type: 'input',
              name: 'feedback',
              message: 'Describe the changes you want:',
            },
          ]);

          // Capture what gets discarded BEFORE resetting — shown to the user
          // and handed to the AI so it knows its previous edits are gone.
          const discardedStat = safeDiffStat(anchor);

          // Unexpected uncommitted files (e.g. reviewer droppings) must not
          // be silently destroyed by reset --hard — stash them recoverably.
          if (gitStatus().trim()) {
            display.warn('Worktree has uncommitted changes — stashing them (recover with `git stash pop`).');
            gitStashPushAll(`pxs: pre-request-change ${name} task-${i + 1}`);
          }

          display.info("Discarding this task's commits:");
          console.log(discardedStat || '  (nothing to discard)');
          gitResetHard(anchor);

          // Persist status only AFTER the reset succeeded: if we crash in
          // between, state still says review_pending with an unchanged anchor
          // and the empty-diff guard catches it safely on the next run.
          task.status = 'in_progress';
          state.upsertFeature(feature);

          const templateName = testConfig.tdd ? 'implement-tdd' : 'implement';
          const redoPrompt =
            assemblePrompt({
              templateName,
              vars: {
                task_content: taskSpec.raw,
                previous_diff: previousTaskSummary(feature, i, anchor),
              },
              agents: args.agents,
              skills: args.skills,
              extraText: args.text,
            }) + revertedAttemptBlock(discardedStat, feedback);

          const result = await runPrompt(backend, redoPrompt, {
            sessionId: sessionId || undefined,
            onEvent,
            log: { dir: logsDir, label: `${name}-task-${i + 1}-redo` },
          });
          sessionId = result.sessionId;
          feature.session = { backend: backendName, id: sessionId };
          state.upsertFeature(feature);
          state.recordUsage(feature, result);

          commitAll(commitMessage);
          taskDiff = safeDiff(anchor);
          if (!taskDiff.trim()) {
            display.warn('The backend made no changes on this attempt.');
          }
          continue reviewLoop;
        }
      }
    }
  }

  // All tasks complete
  const allDone = feature.tasks.every((t) => t.status === 'complete' || t.status === 'skipped');
  if (allDone) {
    feature.phase = 'completed';
    state.upsertFeature(feature);

    display.heading('All Tasks Complete');
    for (const t of feature.tasks) {
      console.log(`  ${display.taskIcon(t.status)} ${t.name}`);
    }

    // Final branch code review — independent expert that verifies the whole
    // branch against the spec and any developer-provided documents. Runs on
    // the reviewer's backend in a fresh, read-only session (not the
    // implementer's) to avoid self-review bias.
    if (!options.skipReview) {
      display.info(`Running independent final review (${reviewerLabel}; spec & document conformance)...`);
      try {
        const branchDiff = gitDiffBranch(baseBranch);
        const specContent = fs.existsSync(state.specPath(name))
          ? fs.readFileSync(state.specPath(name), 'utf-8')
          : '(spec not found)';

        const finalReview = await runExpertReview({
          ...reviewer,
          templateName: 'final-review',
          vars: {
            branch_diff: branchDiff,
            spec_content: specContent,
            plan_content: planContent,
            docs_content: docsContent,
          },
          agents: args.agents,
          skills: args.skills,
          extraText: args.text,
          log: { dir: logsDir, label: `${name}-final-review` },
          onEvent,
        });
        state.recordUsage(feature, finalReview);

        // Save final review
        const finalReviewPath = path.join(state.reviewsDir(), `${name}-final.md`);
        fs.writeFileSync(finalReviewPath, finalReview.output, 'utf-8');

        display.heading('Final Code Review');
        console.log('\n' + finalReview.output + '\n');
      } catch (err) {
        display.warn(`Final review failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (feature.usage) {
      display.info(
        `Total AI usage: $${feature.usage.cost_usd.toFixed(4)} · ` +
        `${display.formatDuration(feature.usage.duration_ms)} · ${feature.usage.runs} runs`
      );
    }

    let merge: string;
    if (autoYes) {
      // Merging is destructive — never auto-merge in non-interactive mode
      display.info('--yes: keeping branch. Merge manually when ready.');
      merge = 'keep-branch';
    } else {
      ({ merge } = await inquirer.prompt([
        {
          type: 'list',
          name: 'merge',
          message: 'What would you like to do?',
          choices: ['merge', 'squash-merge', 'keep-branch'],
        },
      ]));
    }

    if (merge === 'merge' || merge === 'squash-merge') {
      gitCheckout(baseBranch);
      gitMerge(feature.branch, merge === 'squash-merge');
      feature.phase = 'merged';
      state.upsertFeature(feature);
      display.success(`Merged ${feature.branch} into ${baseBranch}.`);
    } else {
      display.info(`Branch ${feature.branch} kept. Merge manually when ready.`);
    }
  }
}

/** Diff of everything (committed or not) since the given anchor commit. */
function safeDiff(anchor: string): string {
  try {
    return gitDiff(anchor);
  } catch {
    return '';
  }
}

function safeDiffStat(anchor: string): string {
  try {
    return gitDiffStat(anchor);
  } catch {
    return '';
  }
}

/**
 * Summary of the previous task's changes: the diff between its anchor and
 * the current task's anchor (i.e. exactly the commits it produced).
 */
function previousTaskSummary(feature: FeatureState, index: number, currentAnchor: string): string {
  if (index === 0) return '';
  const prev = feature.tasks[index - 1];
  if (!prev?.anchor) return '';
  try {
    return gitDiff(prev.anchor, currentAnchor);
  } catch {
    return '';
  }
}

/**
 * Stage and commit all changes, printing what gets swept in so `git add -A`
 * never silently commits stray files. Returns false when the worktree is
 * clean (benign: the AI made no changes). Real git failures propagate —
 * per the spec, git errors are displayed, never auto-fixed or swallowed.
 */
function commitAll(message: string): boolean {
  const status = gitStatus().trim();
  if (!status) {
    display.info('No changes to commit.');
    return false;
  }
  const lines = status.split('\n');
  display.info(`Committing ${lines.length} file(s):`);
  for (const line of lines.slice(0, 20)) {
    console.log(`    ${line}`);
  }
  if (lines.length > 20) {
    console.log(`    … and ${lines.length - 20} more`);
  }
  gitCommit(message);
  return true;
}

/** Generate tests in the implementer session and commit them. */
async function generateTests(opts: {
  backend: ReturnType<typeof createBackend>;
  sessionId: string;
  testConfig: TestConfig;
  taskDiff: string;
  taskRaw: string;
  commitMessage: string;
  onEvent?: (event: Record<string, unknown>) => void;
  log?: { dir: string; label: string };
}): Promise<{ sessionId: string; costUsd?: number; durationMs?: number }> {
  const testType = opts.testConfig.intg ? 'integration' : 'unit';
  const testPrompt = assemblePrompt({
    templateName: 'test',
    vars: {
      test_type: testType,
      git_diff: opts.taskDiff,
      task_content: opts.taskRaw,
    },
  });

  const result = await runPrompt(opts.backend, testPrompt, {
    sessionId: opts.sessionId || undefined,
    onEvent: opts.onEvent,
    log: opts.log,
  });
  commitAll(opts.commitMessage);
  return { sessionId: result.sessionId, costUsd: result.costUsd, durationMs: result.durationMs };
}

/**
 * Prompt block appended when re-running a task after request-change: the AI
 * resumes the same session, so it must be told its earlier edits were
 * reverted or it will act on stale memory of files that no longer exist.
 */
function revertedAttemptBlock(discardedStat: string, feedback: string): string {
  return `

## Previous Attempt Reverted
Your previous implementation of this task was reviewed and rejected. Its commits
were discarded via \`git reset --hard\`; the following files were restored to their
state before your previous attempt and no longer contain those edits:

${discardedStat || '(no file list available)'}

Do not assume any previous edits still exist — re-read current file contents before editing.

## User Feedback
${feedback}`;
}

interface TestConfig {
  tdd: boolean;
  intg: boolean;
  postHoc: boolean;
}

function parseTestOptions(test: string[] | boolean | undefined): TestConfig {
  if (test === undefined || test === false) {
    return { tdd: false, intg: false, postHoc: false };
  }
  if (test === true || (Array.isArray(test) && test.length === 0)) {
    return { tdd: false, intg: false, postHoc: true };
  }
  const arr = test as string[];
  return {
    tdd: arr.includes('tdd'),
    intg: arr.includes('intg'),
    postHoc: !arr.includes('tdd'),
  };
}
