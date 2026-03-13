import fs from 'node:fs';
import inquirer from 'inquirer';
import { StateManager } from '../state/manager.js';
import { createBackend } from '../backends/factory.js';
import * as display from '../utils/display.js';

export async function newCommand(
  name: string,
  options: { desc?: string; jira?: string[]; interactive?: boolean }
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

  // Update state
  state.upsertFeature({
    feature: name,
    type: 'feat',
    branch: '',
    phase: 'spec_created',
    total_tasks: 0,
    current_task: 0,
    tasks: [],
  });

  display.success(`Spec created: ${state.specPath(name)}`);
  display.info(`Edit the spec, then run \`pxs refine ${name}\``);
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

    const result = await backend.execute(prompt);
    fs.writeFileSync(state.specPath(name), result.output, 'utf-8');
  } catch (err) {
    display.warn(`AI generation failed: ${err}. Creating blank spec.`);
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

    const result = await backend.execute(prompt);
    fs.writeFileSync(state.specPath(name), result.output, 'utf-8');
    display.success(`Generated spec from ${tickets.length} Jira ticket(s).`);
  } catch (err) {
    display.warn(`Jira integration failed: ${err}. Creating blank spec.`);
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
