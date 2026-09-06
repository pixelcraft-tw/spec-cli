import fs from 'node:fs';
import inquirer from 'inquirer';
import { StateManager } from '../state/manager.js';
import { createBackend } from '../backends/factory.js';
import { runPrompt } from '../backends/run.js';
import { CLAUDE_MODEL_CHOICES, codexModelChoices } from '../discovery/models.js';
import {
  resolveReviewer,
  describeReviewer,
  reviewerCliDefaults,
  knownEfforts,
  type ReviewFlags,
} from '../utils/review.js';
import type { ProjectConfig, ReviewChoice, ReviewMode } from '../state/types.js';
import * as display from '../utils/display.js';

export async function newCommand(
  name: string,
  options: { desc?: string; jira?: string[]; interactive?: boolean } & ReviewFlags
): Promise<void> {
  const state = new StateManager();
  state.ensureWorkflow();

  const specPath = state.specPath(name);

  // Check if spec already exists
  if (fs.existsSync(specPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Spec "${name}" already exists. Overwrite?`,
        default: false,
      },
    ]);
    if (!overwrite) {
      display.info('Aborted.');
      return;
    }
  }

  // Ensure specs dir exists
  fs.mkdirSync(state.specsDir(), { recursive: true });

  if (options.jira && options.jira.length > 0) {
    await createFromJira(name, options.jira, state);
  } else if (options.desc) {
    await createFromDesc(name, options.desc, state);
  } else if (options.interactive) {
    await createInteractive(name, state);
  } else {
    createBlank(name, state);
  }

  // Independent reviewer for this feature — asked once, after the spec is
  // written, and remembered in state.yaml so later commands need no flags.
  const review = await chooseReviewer(state.readConfig().review, options);

  // Update state
  state.upsertFeature({
    feature: name,
    type: 'feat',
    branch: '',
    phase: 'spec_created',
    total_tasks: 0,
    current_task: 0,
    tasks: [],
    ...(review ? { review } : {}),
  });

  display.success(`Spec created: ${state.specPath(name)}`);
  if (review) {
    display.info(`Reviewer: ${describeReviewer(review)} (change later with --review-mode/--review-model/--review-effort)`);
  }
  display.info(`Edit the spec, then run \`pxs refine ${name}\``);
}

const CUSTOM_MODEL = '__custom__';

/**
 * Pick the reviewer for a new feature. Flags win without prompting. Otherwise
 * ask interactively — but only when the codex CLI is installed, because
 * without it `agent` is the only option and the question would be noise.
 * Choices are lists (model names come from the CLIs), so nothing has to be
 * remembered or typed. Returns undefined when nothing was chosen, in which
 * case config.yaml applies.
 */
async function chooseReviewer(
  config: ProjectConfig['review'],
  flags: ReviewFlags
): Promise<ReviewChoice | undefined> {
  if (flags.reviewMode || flags.reviewModel || flags.reviewEffort) {
    // Validates the mode and normalizes empty values, same as implement will
    const r = resolveReviewer(config, undefined, flags);
    return { mode: r.mode, ...(r.model ? { model: r.model } : {}), ...(r.effort ? { effort: r.effort } : {}) };
  }

  if (!process.stdout.isTTY) return undefined;
  if (!(await createBackend('codex').isAvailable())) return undefined;

  const { mode } = (await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Independent reviewer for this feature:',
      choices: [
        { name: 'agent — isolated Claude Code reviewer', value: 'agent' },
        { name: 'codex — OpenAI Codex CLI (cross-vendor second opinion)', value: 'codex' },
      ],
      default: config.mode,
    },
  ])) as { mode: ReviewMode };

  const perMode = mode === 'codex' ? config.codex : config.agent;
  const models = mode === 'codex' ? codexModelChoices() : CLAUDE_MODEL_CHOICES;
  // Show what "(default)" really means: config.yaml first, then what the
  // CLI itself would use, so the user always knows which model/effort runs.
  const cli = mode === 'codex' ? 'codex' : 'claude';
  const cliDefaults = reviewerCliDefaults(mode);
  const defaultLabel = (configured: string, fromCli: string | undefined): string =>
    configured
      ? `${configured} (config.yaml)`
      : fromCli
        ? `${fromCli} (${cliDefaults.source})`
        : `${cli} CLI default`;

  const { model: picked } = (await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Reviewer model:',
      choices: [
        { name: `(default: ${defaultLabel(perMode.model, cliDefaults.model)})`, value: '' },
        ...models.map((m) => ({ name: m.label, value: m.id })),
        { name: 'other — type a model id', value: CUSTOM_MODEL },
      ],
    },
  ])) as { model: string };

  let model = picked;
  if (picked === CUSTOM_MODEL) {
    ({ model } = (await inquirer.prompt([
      { type: 'input', name: 'model', message: 'Model id:' },
    ])) as { model: string });
    model = model.trim();
  }

  // Effort choices follow the picked model when the CLI told us what it
  // supports; otherwise the generic list for that mode.
  const efforts = models.find((m) => m.id === model)?.efforts ?? knownEfforts(mode);
  const { effort } = (await inquirer.prompt([
    {
      type: 'list',
      name: 'effort',
      message: 'Reviewer effort:',
      choices: [
        { name: `(default: ${defaultLabel(perMode.effort, cliDefaults.effort)})`, value: '' },
        ...efforts.map((e) => ({ name: e, value: e })),
      ],
    },
  ])) as { effort: string };

  return { mode, ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
}

function createBlank(name: string, state: StateManager): void {
  const templatePath = state.templatesDir() + '/spec-template.md';
  let template: string;

  if (fs.existsSync(templatePath)) {
    template = fs.readFileSync(templatePath, 'utf-8');
    template = template.replace('<name>', name);
  } else {
    template = `# Feature: ${name}

## Context
<!-- 2-3 sentences of project background -->

## Requirements
<!-- Numbered list with acceptance criteria -->

## Constraints
<!-- Technical limitations, compatibility requirements -->

## Notes
<!-- Additional notes -->
`;
  }

  fs.writeFileSync(state.specPath(name), template, 'utf-8');
}

async function createFromDesc(name: string, desc: string, state: StateManager): Promise<void> {
  display.info('Generating spec from description...');

  try {
    const config = state.readConfig();
    const backend = createBackend(config.backend.default);

    if (!(await backend.isAvailable())) {
      display.error(`Backend "${config.backend.default}" is not available. Install claude or codex.`);
      createBlank(name, state);
      display.warn('Created blank spec instead.');
      return;
    }

    const prompt = `Create a detailed feature spec in markdown format for the following feature:

Name: ${name}
Description: ${desc}

Output format:
# Feature: ${name}

## Context
(2-3 sentences of background)

## Requirements
(Numbered list with acceptance criteria)

## Constraints
(Technical limitations)

## Notes
(Additional notes)`;

    const result = await runPrompt(backend, prompt);
    fs.writeFileSync(state.specPath(name), result.output, 'utf-8');
  } catch (err) {
    display.warn(`AI generation failed: ${err instanceof Error ? err.message : err}. Creating blank spec.`);
    createBlank(name, state);
  }
}

async function createFromJira(name: string, tickets: string[], state: StateManager): Promise<void> {
  display.info(`Fetching Jira tickets: ${tickets.join(', ')}...`);

  try {
    const config = state.readConfig();
    const backend = createBackend(config.backend.default);

    if (!(await backend.isAvailable())) {
      display.error(`Backend "${config.backend.default}" is not available.`);
      createBlank(name, state);
      display.warn('Created blank spec instead.');
      return;
    }

    const ticketList = tickets.map((t) => `- ${t}`).join('\n');
    const prompt = `You have access to a Jira MCP server. Use it to read the following tickets and generate a feature spec.

Tickets:
${ticketList}

For each ticket, retrieve: summary, description, acceptance criteria, labels, and priority.

Then combine the information into a single feature spec in this format:

# Feature: ${name}

## Context
(2-3 sentences of background, derived from ticket descriptions)

## Requirements
(Numbered list with acceptance criteria, merged from all tickets)

## Constraints
(Technical limitations mentioned in tickets)

## Source Tickets
${ticketList}

## Notes
(Additional notes from ticket comments or labels)

If you cannot access Jira MCP, output the spec template with the ticket IDs listed so the user can fill in details manually.`;

    const result = await runPrompt(backend, prompt);
    fs.writeFileSync(state.specPath(name), result.output, 'utf-8');
    display.success(`Generated spec from ${tickets.length} Jira ticket(s).`);
  } catch (err) {
    display.warn(`Jira integration failed: ${err instanceof Error ? err.message : err}. Creating blank spec.`);
    createBlank(name, state);
  }
}

async function createInteractive(name: string, state: StateManager): Promise<void> {
  const answers = await inquirer.prompt([
    { type: 'input', name: 'context', message: 'Project context (2-3 sentences):' },
    { type: 'editor', name: 'requirements', message: 'Requirements (one per line):' },
    { type: 'input', name: 'constraints', message: 'Constraints:' },
    { type: 'input', name: 'notes', message: 'Additional notes:' },
  ]);

  const spec = `# Feature: ${name}

## Context
${answers.context}

## Requirements
${answers.requirements}

## Constraints
${answers.constraints}

## Notes
${answers.notes}
`;

  fs.writeFileSync(state.specPath(name), spec, 'utf-8');
}
