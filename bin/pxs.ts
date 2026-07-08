#!/usr/bin/env node
import { createProgram } from '../src/cli.js';
import * as display from '../src/utils/display.js';

const program = createProgram();
program.parseAsync(process.argv).catch((err: unknown) => {
  // display.error sets process.exitCode = 1
  display.error(err instanceof Error ? err.message : String(err));
});
