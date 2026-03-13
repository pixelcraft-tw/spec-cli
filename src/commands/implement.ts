import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
import { StateManager } from '../state/manager.js';
import { createBackend } from '../backends/factory.js';
import { parsePlan } from '../parsers/plan.js';
import { assemblePrompt } from '../utils/prompt.js';
import { gitBranch, gitCommit, gitDiff, gitDiffBranch, gitCheckout, gitMerge, gitCurrentBranch } from '../git/operations.js';
import * as display from '../utils/display.js';

export async function implementCommand(
  name: string,
  args: { agents: string[]; skills: string[]; text: string },
  options: { backend?: string; test?: string[] | boolean; skipReview?: boolean }
): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();
  state.checkPhaseGuard('implement', name);

  const feature = state.getFeature(name)!;
  const config = state.readConfig();
  const backendName = options.backend ?? config.backend.default;
  const backend = createBackend(backendName);

  if (!(await backend.isAvailable())) {
    display.error(`Backend "${backendName}" not available.`);
    return;
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

    // Update status
    task.status = 'in_progress';
    feature.current_task = i + 1;
    state.upsertFeature(feature);

    // Build prompt
    const templateName = testConfig.tdd ? 'implement-tdd' : 'implement';
    const previousDiff = i > 0 ? getDiffSummary() : '';
    let taskDiff = previousDiff; // reused after commit

    const prompt = assemblePrompt({
      templateName,
      vars: {
        task_content: taskSpec.raw,
        previous_diff: previousDiff,
      },
      agents: args.agents,
      skills: args.skills,
      extraText: args.text,
    });

    // Execute
    const result = sessionId
      ? await backend.resume(sessionId, prompt)
      : await backend.execute(prompt);

    sessionId = result.sessionId;
    feature.session = { backend: backendName, id: sessionId };

    // Commit implementation
    try {
      gitCommit(`${feature.type}(${name}): task-${i + 1} ${task.name}`);
    } catch {
      display.warn('Nothing to commit or commit failed.');
    }

    // Get diff once after commit — reused for tests and review
    taskDiff = getDiffSummary();

    // Post-hoc tests (if not TDD)
    if (testConfig.postHoc) {
      display.info('Generating tests...');
      const testType = testConfig.intg ? 'integration' : 'unit';
      const testPrompt = assemblePrompt({
        templateName: 'test',
        vars: {
          test_type: testType,
          git_diff: taskDiff,
          task_content: taskSpec.raw,
        },
      });

      await backend.resume(sessionId, testPrompt);
      try {
        gitCommit(`test(${name}): task-${i + 1} ${task.name}`);
      } catch {
        display.warn('No test changes to commit.');
      }
    }

    // AI Review
    display.info('Running AI review...');
    const reviewPrompt = assemblePrompt({
      templateName: 'review',
      vars: {
        git_diff: taskDiff,
        task_content: taskSpec.raw,
      },
      agents: args.agents,
      skills: args.skills,
    });

    const reviewResult = await backend.resume(sessionId, reviewPrompt);
    sessionId = reviewResult.sessionId;

    // Save review
    fs.writeFileSync(state.reviewPath(name, i + 1), reviewResult.output, 'utf-8');

    task.status = 'review_pending';
    state.upsertFeature(feature);

    // Present to user
    console.log('\n' + reviewResult.output + '\n');

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: `Task ${i + 1} review:`,
        choices: ['approve', 'request-change', 'add-test', 'skip'],
      },
    ]);

    switch (choice) {
      case 'approve':
        task.status = 'complete';
        state.upsertFeature(feature);
        display.success(`Task ${i + 1} approved.`);
        break;
      case 'skip':
        task.status = 'skipped';
        state.upsertFeature(feature);
        display.info(`Task ${i + 1} skipped.`);
        break;
      case 'request-change':
        task.status = 'in_progress';
        state.upsertFeature(feature);
        display.info('Re-run `pxs implement` to retry this task.');
        return;
      case 'add-test':
        display.info('Generating additional tests...');
        task.status = 'complete';
        state.upsertFeature(feature);
        break;
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

    // Final branch code review
    if (!options.skipReview) {
      display.info('Running final branch code review...');
      try {
        const branchDiff = gitDiffBranch(baseBranch);
        const specContent = fs.existsSync(state.specPath(name))
          ? fs.readFileSync(state.specPath(name), 'utf-8')
          : '(spec not found)';

        const finalReviewPrompt = assemblePrompt({
          templateName: 'final-review',
          vars: {
            branch_diff: branchDiff,
            spec_content: specContent,
            plan_content: planContent,
          },
          agents: args.agents,
          skills: args.skills,
          extraText: args.text,
        });

        const finalReviewResult = await backend.resume(sessionId, finalReviewPrompt);
        sessionId = finalReviewResult.sessionId;

        // Save final review
        const finalReviewPath = path.join(state.reviewsDir(), `${name}-final.md`);
        fs.writeFileSync(finalReviewPath, finalReviewResult.output, 'utf-8');

        display.heading('Final Code Review');
        console.log('\n' + finalReviewResult.output + '\n');
      } catch (err) {
        display.warn(`Final review failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    const { merge } = await inquirer.prompt([
      {
        type: 'list',
        name: 'merge',
        message: 'What would you like to do?',
        choices: ['merge', 'squash-merge', 'keep-branch'],
      },
    ]);

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

function getDiffSummary(): string {
  try {
    return gitDiff('HEAD~1');
  } catch {
    return '(no previous diff available)';
  }
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
