import fs from 'node:fs';
import { StateManager } from '../state/manager.js';
import { createBackend } from '../backends/factory.js';
import { runPrompt } from '../backends/run.js';
import { assemblePrompt } from '../utils/prompt.js';
import * as display from '../utils/display.js';

export async function clarifyCommand(
  name: string,
  args: { agents: string[]; skills: string[]; text: string }
): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();
  state.checkPhaseGuard('clarify', name);

  const specPath = state.specPath(name);
  if (!fs.existsSync(specPath)) {
    display.error(`Spec "${name}" not found. Run \`pxs new ${name}\` first.`);
    return;
  }

  const specContent = fs.readFileSync(specPath, 'utf-8');
  const config = state.readConfig();
  const backend = createBackend(config.backend.default);

  if (!(await backend.isAvailable())) {
    display.error(`Backend "${config.backend.default}" not available.`);
    return;
  }

  display.heading(`Clarifying: ${name}`);

  const prompt = assemblePrompt({
    templateName: 'clarify',
    vars: { spec_content: specContent },
    agents: args.agents,
    skills: args.skills,
    extraText: args.text,
  });

  const feature = state.getFeature(name);
  const result = await runPrompt(backend, prompt, {
    sessionId: feature?.session?.id,
    onEvent: display.renderBackendEvent,
    log: { dir: state.logsDir(), label: `${name}-clarify` },
  });
  if (feature) {
    state.recordUsage(feature, result);
  }

  console.log('\n' + result.output);

  // Update state
  if (feature) {
    feature.phase = 'clarifying';
    feature.session = { backend: config.backend.default, id: result.sessionId };
    state.upsertFeature(feature);
  }
}
