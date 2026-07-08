import fs from 'node:fs';
import path from 'node:path';
import { StateManager } from '../state/manager.js';
import { createBackend } from '../backends/factory.js';
import { runExpertReview, loadDocs } from '../utils/review.js';
import { gitDiffBranch } from '../git/operations.js';
import * as display from '../utils/display.js';

export async function reviewCommand(
  name: string,
  options: { step?: number; summary?: boolean; run?: boolean; backend?: string; docs?: string[] }
): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();
  state.checkPhaseGuard('review', name);

  const feature = state.getFeature(name);
  if (!feature) {
    display.error(`Feature "${name}" not found.`);
    return;
  }

  // Re-run an independent expert review on demand (no re-implementation).
  if (options.run) {
    const config = state.readConfig();
    const backendName = options.backend ?? config.backend.default;
    const backend = createBackend(backendName);
    if (!(await backend.isAvailable())) {
      display.error(`Backend "${backendName}" not available.`);
      return;
    }

    const baseBranch = feature.base_branch || 'main';
    const specContent = fs.existsSync(state.specPath(name))
      ? fs.readFileSync(state.specPath(name), 'utf-8')
      : '(spec not found)';
    const planContent = fs.existsSync(state.planPath(name))
      ? fs.readFileSync(state.planPath(name), 'utf-8')
      : '(plan not found)';

    display.info('Running independent expert review (spec & document conformance)...');
    const review = await runExpertReview({
      backend,
      templateName: 'final-review',
      vars: {
        branch_diff: gitDiffBranch(baseBranch),
        spec_content: specContent,
        plan_content: planContent,
        docs_content: loadDocs(options.docs),
      },
      log: { dir: state.logsDir(), label: `${name}-final-review` },
      onEvent: display.renderBackendEvent,
    });
    state.recordUsage(feature, review);

    fs.mkdirSync(state.reviewsDir(), { recursive: true });
    const finalReviewPath = path.join(state.reviewsDir(), `${name}-final.md`);
    fs.writeFileSync(finalReviewPath, review.output, 'utf-8');

    display.heading(`Independent Review: ${name}`);
    console.log('\n' + review.output + '\n');
    return;
  }

  if (options.summary) {
    display.heading(`Review Summary: ${name}`);
    for (let i = 0; i < feature.tasks.length; i++) {
      const t = feature.tasks[i];
      const reviewPath = state.reviewPath(name, i + 1);
      const hasReview = fs.existsSync(reviewPath);
      console.log(`  ${i + 1}. ${display.taskIcon(t.status)} ${t.name} ${hasReview ? '(reviewed)' : ''}`);
    }

    // Show final review status
    const finalReviewPath = path.join(state.reviewsDir(), `${name}-final.md`);
    if (fs.existsSync(finalReviewPath)) {
      console.log(`\n  Final branch review: exists`);
    }
    return;
  }

  if (options.step !== undefined) {
    const reviewPath = state.reviewPath(name, options.step);
    if (!fs.existsSync(reviewPath)) {
      display.error(`Review for task ${options.step} not found.`);
      return;
    }
    const content = fs.readFileSync(reviewPath, 'utf-8');
    display.heading(`Review: ${name} - Task ${options.step}`);
    console.log(content);
    return;
  }

  // Default: if completed, show final review first
  if (feature.phase === 'completed' || feature.phase === 'merged') {
    const finalReviewPath = path.join(state.reviewsDir(), `${name}-final.md`);
    if (fs.existsSync(finalReviewPath)) {
      display.heading(`Final Branch Review: ${name}`);
      console.log(fs.readFileSync(finalReviewPath, 'utf-8'));
      return;
    }
  }

  // Show most recent or pending review
  const pendingIdx = feature.tasks.findIndex((t) => t.status === 'review_pending');
  if (pendingIdx >= 0) {
    const reviewPath = state.reviewPath(name, pendingIdx + 1);
    if (fs.existsSync(reviewPath)) {
      display.heading(`Pending Review: Task ${pendingIdx + 1}`);
      console.log(fs.readFileSync(reviewPath, 'utf-8'));
      return;
    }
  }

  // Show last completed task's review
  for (let i = feature.tasks.length - 1; i >= 0; i--) {
    const reviewPath = state.reviewPath(name, i + 1);
    if (fs.existsSync(reviewPath)) {
      display.heading(`Latest Review: Task ${i + 1}`);
      console.log(fs.readFileSync(reviewPath, 'utf-8'));
      return;
    }
  }

  display.info('No reviews found.');
}
