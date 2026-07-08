import chalk from 'chalk';

export function heading(text: string): void {
  console.log(chalk.bold.cyan(`\n━━━ ${text} ━━━\n`));
}

export function success(text: string): void {
  console.log(chalk.green(`  ✓ ${text}`));
}

/**
 * Print an error line. Side effect: marks the process as failed
 * (process.exitCode = 1) so scripts and CI can detect the failure —
 * every call site is a fatal guard that returns immediately after.
 */
export function error(text: string): void {
  process.exitCode = 1;
  console.log(chalk.red(`  ✗ ${text}`));
}

export function warn(text: string): void {
  console.log(chalk.yellow(`  ⚠ ${text}`));
}

export function info(text: string): void {
  console.log(chalk.gray(`  ℹ ${text}`));
}

export function taskIcon(status: string): string {
  switch (status) {
    case 'complete': return '✅';
    case 'in_progress': return '⏳';
    case 'skipped': return '⏭️';
    case 'review_pending': return '🔍';
    case 'pending':
    default: return '⬜';
  }
}

export function table(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const colValues = [h, ...rows.map((r) => r[i] ?? '')];
    return Math.max(...colValues.map((v) => v.length));
  });

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(chalk.bold(headerLine));

  // Print rows
  for (const row of rows) {
    const line = row.map((cell, i) => (cell ?? '').padEnd(widths[i])).join('  ');
    console.log(line);
  }
}
