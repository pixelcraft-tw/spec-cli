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

export function createProgram(): Command {
  const program = new Command();

  program
    .name('pxs')
    .description('Spec-driven development CLI')
    .version('1.0.0');

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
    .allowUnknownOption()
    .action((name: string, options: { backend?: string; test?: string[] | boolean; skipReview?: boolean }, cmd: Command) => {
      const rawArgs = cmd.args ?? [];
      const parsed = parseArgs(rawArgs);
      return implementCommand(name, parsed, options);
    });

  program
    .command('review <name>')
    .description('View review records')
    .option('--step <n>', 'View specific task review', parseInt)
    .option('--summary', 'Summary overview of all tasks')
    .allowUnknownOption()
    .action((name: string, options: { step?: number; summary?: boolean }) => {
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
