import { StateManager } from '../state/manager.js';
import type { Phase } from '../state/types.js';
import * as display from '../utils/display.js';

const VALID_RESET_TARGETS: Phase[] = [
  'spec_created',
  'clarifying',
  'spec_approved',
  'plan_pending_approval',
  'ready_to_implement',
];

export async function resetCommand(
  name: string,
  options: { to?: string }
): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();

  const feature = state.getFeature(name);
  if (!feature) {
    display.error(`Feature "${name}" not found.`);
    return;
  }

  const targetPhase = (options.to ?? 'spec_created') as Phase;

  if (!VALID_RESET_TARGETS.includes(targetPhase)) {
    display.error(
      `Cannot reset to "${targetPhase}". Valid targets: ${VALID_RESET_TARGETS.join(', ')}`
    );
    return;
  }

  const previousPhase = feature.phase;
  feature.phase = targetPhase;

  // Clear downstream state depending on target
  if (targetPhase === 'spec_created' || targetPhase === 'clarifying'
    || targetPhase === 'spec_approved' || targetPhase === 'plan_pending_approval') {
    feature.tasks = [];
    feature.total_tasks = 0;
    feature.current_task = 0;
    feature.session = undefined;
  }

  if (targetPhase === 'ready_to_implement') {
    // Reset task statuses to pending
    for (const task of feature.tasks) {
      task.status = 'pending';
    }
    feature.current_task = 0;
    feature.session = undefined;
  }

  state.upsertFeature(feature);
  display.success(`Reset "${name}": ${previousPhase} → ${targetPhase}`);
}
