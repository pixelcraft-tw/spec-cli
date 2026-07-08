import fs from 'node:fs';
import inquirer from 'inquirer';
import { StateManager } from '../state/manager.js';
import { createBackend } from '../backends/factory.js';
import { runPrompt } from '../backends/run.js';
import { assemblePrompt } from '../utils/prompt.js';
import { parsePlan } from '../parsers/plan.js';
import * as display from '../utils/display.js';

export async function refineCommand(
  name: string,
  args: { agents: string[]; skills: string[]; text: string },
  options: { skipClarify?: boolean; clarify?: number }
): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();
  state.checkPhaseGuard('refine', name);

  const specPath = state.specPath(name);
  if (!fs.existsSync(specPath)) {
    display.error(`Spec "${name}" not found. Run \`pxs new ${name}\` first.`);
    return;
  }

  const config = state.readConfig();
  const backend = createBackend(config.backend.default);

  if (!(await backend.isAvailable())) {
    display.error(`Backend "${config.backend.default}" not available.`);
    return;
  }

  let specContent = fs.readFileSync(specPath, 'utf-8');
  const feature = state.getFeature(name)!;
  let sessionId = feature.session?.id ?? '';

  // Sub-flow 1: Clarify (unless skipped)
  if (!options.skipClarify) {
    display.heading('Phase 1: Requirement Clarification');

    const clarifyPrompt = assemblePrompt({
      templateName: 'clarify',
      vars: { spec_content: specContent },
      agents: args.agents,
      skills: args.skills,
      extraText: args.text,
    });

    const clarifyResult = await runPrompt(backend, clarifyPrompt, {
      sessionId: sessionId || undefined,
    });

    sessionId = clarifyResult.sessionId;
    console.log('\n' + clarifyResult.output);

    feature.phase = 'clarifying';
    feature.session = { backend: config.backend.default, id: sessionId };
    state.upsertFeature(feature);

    // Wait for user to answer questions (in CLI mode, AI handles the conversation)
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Proceed to spec refinement?',
        default: true,
      },
    ]);

    if (!proceed) {
      display.info('Paused. Run `pxs refine` again when ready.');
      return;
    }
  }

  // Sub-flow 2: Refine spec
  display.heading('Phase 2: Refine Spec');

  specContent = fs.readFileSync(specPath, 'utf-8');
  const refinePrompt = assemblePrompt({
    templateName: 'refine',
    vars: { spec_content: specContent },
    agents: args.agents,
    skills: args.skills,
    extraText: args.text,
  });

  const refineResult = await runPrompt(backend, refinePrompt, {
    sessionId: sessionId || undefined,
  });

  sessionId = refineResult.sessionId;

  // Save refined spec
  fs.writeFileSync(specPath, refineResult.output, 'utf-8');
  display.success(`Refined spec saved to ${specPath}`);
  console.log('\n' + refineResult.output.slice(0, 500) + '...\n');

  feature.phase = 'spec_approved';
  feature.session = { backend: config.backend.default, id: sessionId };
  state.upsertFeature(feature);

  const { approveSpec } = await inquirer.prompt([
    {
      type: 'list',
      name: 'approveSpec',
      message: 'Spec refinement:',
      choices: ['approve', 'edit'],
    },
  ]);

  if (approveSpec === 'edit') {
    display.info(`Edit ${specPath} and run \`pxs refine ${name} --skip-clarify\``);
    return;
  }

  // Sub-flow 3: Decompose plan
  display.heading('Phase 3: Decompose Plan');

  specContent = fs.readFileSync(specPath, 'utf-8');
  const planPrompt = `Decompose the following refined spec into an implementation plan with discrete tasks.

${specContent}

Output the plan in this exact format:
# Implementation Plan: ${name}

> type: feat
> branch: feat/${name}
> total_tasks: N

## Task 1: <title>
- **Files**:
  - \`path/to/file\` (new|modify)
- **Description**: What to implement
- **Depends on**: None | Task N
- **Complexity**: Low | Medium | High
- **Acceptance**: Definition of done

(repeat for each task)`;

  const planResult = await runPrompt(backend, planPrompt, {
    sessionId: sessionId || undefined,
  });

  sessionId = planResult.sessionId;

  // Save plan
  fs.mkdirSync(state.plansDir(), { recursive: true });
  const planPath = state.planPath(name);
  fs.writeFileSync(planPath, planResult.output, 'utf-8');
  display.success(`Plan saved to ${planPath}`);
  console.log('\n' + planResult.output + '\n');

  // Parse plan for state
  const plan = parsePlan(planResult.output);

  feature.phase = 'plan_pending_approval';
  feature.session = { backend: config.backend.default, id: sessionId };
  state.upsertFeature(feature);

  const { approvePlan } = await inquirer.prompt([
    {
      type: 'list',
      name: 'approvePlan',
      message: 'Implementation plan:',
      choices: ['approve', 'edit', 're-split'],
    },
  ]);

  if (approvePlan === 'edit') {
    display.info(`Edit ${planPath} and run \`pxs refine ${name} --skip-clarify\``);
    return;
  }

  if (approvePlan === 're-split') {
    display.info('Re-splitting not yet implemented. Edit the plan manually.');
    return;
  }

  // Approve: update state
  feature.type = plan.type;
  feature.branch = plan.branch || `${plan.type}/${name}`;
  feature.phase = 'ready_to_implement';
  feature.total_tasks = plan.tasks.length;
  feature.current_task = 0;
  feature.tasks = plan.tasks.map((t) => ({
    name: t.title,
    status: 'pending' as const,
  }));
  state.upsertFeature(feature);

  display.success('Plan approved! Run `pxs implement ' + name + '` to start.');
}
