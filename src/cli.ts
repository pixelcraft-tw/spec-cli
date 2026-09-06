import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { newCommand } from './commands/new.js';
import { refineCommand } from './commands/refine.js';
import { clarifyCommand } from './commands/clarify.js';
import { implementCommand } from './commands/implement.js';
import { reviewCommand } from './commands/review.js';
import { statusCommand } from './commands/status.js';
import { resetCommand } from './commands/reset.js';
import { diffCommand } from './commands/diff.js';
import { parseArgs } from './parsers/arguments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

export function createProgram(): Command {
  const program = new Command();

  program
    .name('pxs')
    .description('Spec-driven development CLI')
    .version(pkg.version);

  program
    .command('init')
    .description('Initialize pxs workflow for this project')
    .option('--force', 'Overwrite existing .workflow/')
    .option('--arch <architecture>', 'Architecture pattern (clean|hexagonal|ddd|layered|modular|custom)')
    .option('--lang <lang-framework>', 'Language-framework (overrides auto-detect)')
    .action(initCommand);

  program
    .command('new <name>')
    .description('Create a new spec file')
    .option('--desc <text>', 'Generate spec from text description')
    .option('--jira <tickets...>', 'Import from Jira tickets')
    .option('-i, --interactive', 'Interactive Q&A mode')
    .option('--review-mode <mode>', 'Independent reviewer for this feature: agent | codex (skips the prompt)')
    .option('--review-model <model>', 'Reviewer model (claude alias/id, or codex model id)')
    .option('--review-effort <level>', 'Reviewer effort (claude: low|medium|high|xhigh|max · codex: low|medium|high|xhigh|...)')
    .action(newCommand);

  program
    .command('refine <name>')
    .description('Refine spec and decompose implementation plan')
    .option('--skip-clarify', 'Skip requirement clarification')
    .option('--clarify <n>', 'Max clarification rounds', parseInt)
    .allowUnknownOption()
    .action((name: string, options: { skipClarify?: boolean; clarify?: number }, cmd: Command) => {
      const rawArgs = cmd.args ?? [];
      const parsed = parseArgs(rawArgs);
      return refineCommand(name, parsed, options);
    });

  program
    .command('clarify <name>')
    .description('Run requirement clarification on a spec')
    .allowUnknownOption()
    .action((name: string, _options: unknown, cmd: Command) => {
      const rawArgs = cmd.args ?? [];
      const parsed = parseArgs(rawArgs);
      return clarifyCommand(name, parsed);
    });

  program
    .command('implement <name>')
    .description('Implement code task by task')
    .option('--backend <name>', 'AI backend (claude | codex)')
    .option('--test [types...]', 'Test strategy')
    .option('--skip-review', 'Skip final branch code review')
    .option('--docs <paths...>', 'Reference documents fed to the reviewer (put last)')
    .option('--yes', 'Non-interactive: auto-approve PASS reviews, stop on NEEDS_CHANGES, keep branch (for CI/automation)')
    .option('--review-mode <mode>', 'Independent reviewer: agent (isolated Claude Code) | codex (OpenAI Codex CLI)')
    .option('--review-model <model>', 'Reviewer model (claude alias/id, or codex model id)')
    .option('--review-effort <level>', 'Reviewer effort (claude: low|medium|high|xhigh|max · codex: low|medium|high|xhigh|...)')
    .allowUnknownOption()
    .action((name: string, options: { backend?: string; test?: string[] | boolean; skipReview?: boolean; docs?: string[]; yes?: boolean; reviewMode?: string; reviewModel?: string; reviewEffort?: string }, cmd: Command) => {
      const rawArgs = cmd.args ?? [];
      const parsed = parseArgs(rawArgs);
      return implementCommand(name, parsed, options);
    });

  program
    .command('review <name>')
    .description('View review records, or re-run an independent expert review with --run')
    .option('--step <n>', 'View specific task review', parseInt)
    .option('--summary', 'Summary overview of all tasks')
    .option('--run', 'Re-run an independent expert review (spec & document conformance) now')
    .option('--review-mode <mode>', 'Reviewer for --run: agent (isolated Claude Code) | codex (OpenAI Codex CLI)')
    .option('--review-model <model>', 'Reviewer model for --run (claude alias/id, or codex model id)')
    .option('--review-effort <level>', 'Reviewer effort for --run (claude: low|medium|high|xhigh|max · codex: low|medium|high|xhigh|...)')
    .option('--docs <paths...>', 'Reference documents fed to the reviewer (put last)')
    .allowUnknownOption()
    .action((name: string, options: { step?: number; summary?: boolean; run?: boolean; docs?: string[]; reviewMode?: string; reviewModel?: string; reviewEffort?: string }) => {
      return reviewCommand(name, options);
    });

  program
    .command('status [name]')
    .description('View workflow status')
    .action((name?: string) => {
      return statusCommand(name);
    });

  program
    .command('reset <name>')
    .description('Reset feature phase (unstick a feature)')
    .option('--to <phase>', 'Target phase (default: spec_created)')
    .action((name: string, options: { to?: string }) => {
      return resetCommand(name, options);
    });

  program
    .command('diff <name>')
    .description('Show remaining tasks from the plan')
    .action((name: string) => {
      return diffCommand(name);
    });

  return program;
}
