import fs from 'node:fs';
import { StateManager } from '../state/manager.js';
import { parsePlan } from '../parsers/plan.js';
import * as display from '../utils/display.js';

export async function diffCommand(name: string): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();
  const feature = state.getFeature(name);
  if (!feature) {
    display.error(`Feature "${name}" not found.`);
    return;
  }
  state.checkPhaseGuard('diff', name);

  const planPath = state.planPath(name);
  if (!fs.existsSync(planPath)) {
    display.error(`Plan not found for "${name}". Run \`pxs refine ${name}\` first.`);
    return;
  }

  const planContent = fs.readFileSync(planPath, 'utf-8');
  const plan = parsePlan(planContent);

  display.heading(`Spec vs Implementation: ${name}`);
  console.log(`  Phase: ${feature.phase}`);
  console.log(`  Branch: ${feature.branch || '-'}`);
  console.log();

  const done: string[] = [];
  const inProgress: string[] = [];
  const remaining: string[] = [];

  for (let i = 0; i < feature.tasks.length; i++) {
    const task = feature.tasks[i];
    const planTask = plan.tasks[i];
    const label = `Task ${i + 1}: ${task.name}`;

    switch (task.status) {
      case 'complete':
        done.push(label);
        break;
      case 'skipped':
        done.push(`${label} (skipped)`);
        break;
      case 'in_progress':
      case 'review_pending':
        inProgress.push(label);
        break;
      case 'pending':
        remaining.push(label);
        break;
    }

    // Show files from plan for pending tasks
    if (planTask && task.status === 'pending') {
      const fileLines = planTask.raw.match(/`[^`]+`\s*\((new|modify)\)/g);
      if (fileLines) {
        for (const line of fileLines) {
          remaining.push(`    ${line}`);
        }
      }
    }
  }

  if (done.length > 0) {
    console.log('  Done:');
    for (const item of done) {
      console.log(`    ${display.taskIcon('complete')} ${item}`);
    }
  }

  if (inProgress.length > 0) {
    console.log('  In Progress:');
    for (const item of inProgress) {
      console.log(`    ${display.taskIcon('in_progress')} ${item}`);
    }
  }

  if (remaining.length > 0) {
    console.log('  Remaining:');
    for (const item of remaining) {
      console.log(`    ${display.taskIcon('pending')} ${item}`);
    }
  }

  // Summary
  const total = feature.tasks.length;
  const completed = feature.tasks.filter(
    (t) => t.status === 'complete' || t.status === 'skipped'
  ).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  console.log(`\n  Progress: ${completed}/${total} tasks (${pct}%)`);
}
