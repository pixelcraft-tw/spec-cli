import { StateManager } from '../state/manager.js';
import * as display from '../utils/display.js';

export async function statusCommand(name?: string): Promise<void> {
  const state = new StateManager();

  if (!state.workflowExists()) {
    display.error('Workflow not initialized. Run `pxs init` first.');
    return;
  }

  const workflowState = state.readState();

  if (!name) {
    // List all features
    if (workflowState.features.length === 0) {
      display.info('No features tracked. Run `pxs new <name>` to start.');
      return;
    }

    display.heading('Workflow Status');
    display.table(
      ['Feature', 'Type', 'Phase', 'Tasks', 'Branch', 'Cost'],
      workflowState.features.map((f) => {
        const completedTasks = f.tasks.filter((t) => t.status === 'complete').length;
        return [
          f.feature,
          f.type,
          f.phase,
          `${completedTasks}/${f.total_tasks}`,
          f.branch || '-',
          f.usage ? `$${f.usage.cost_usd.toFixed(2)}` : '-',
        ];
      })
    );
  } else {
    // Show specific feature
    const feature = state.getFeature(name);
    if (!feature) {
      display.error(`Feature "${name}" not found.`);
      return;
    }

    display.heading(`Feature: ${feature.feature}`);
    console.log(`  Type:    ${feature.type}`);
    console.log(`  Branch:  ${feature.branch || '-'}`);
    console.log(`  Phase:   ${feature.phase}`);
    if (feature.session) {
      console.log(`  Backend: ${feature.session.backend}`);
      console.log(`  Session: ${feature.session.id}`);
    }
    if (feature.usage) {
      console.log(
        `  Usage:   $${feature.usage.cost_usd.toFixed(4)} · ` +
        `${display.formatDuration(feature.usage.duration_ms)} · ${feature.usage.runs} AI runs`
      );
    }

    if (feature.tasks.length > 0) {
      console.log('\n  Tasks:');
      for (let i = 0; i < feature.tasks.length; i++) {
        const t = feature.tasks[i];
        const icon = display.taskIcon(t.status);
        console.log(`    ${i + 1}. ${icon} ${t.name} (${t.status})`);
      }
    }
  }
}
