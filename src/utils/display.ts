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

/**
 * Live renderer for streamed backend events: assistant text and tool calls
 * print as they happen, so long AI runs show progress instead of silence.
 * Understands claude stream-json events; falls back to generic text events.
 */
export function renderBackendEvent(event: Record<string, unknown>): void {
  const e = event as {
    type?: string;
    message?: { content?: Array<{ type?: string; text?: string; name?: string }> };
    text?: string;
  };

  if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
    for (const block of e.message.content) {
      if (block.type === 'text' && block.text?.trim()) {
        console.log(chalk.gray(block.text.trimEnd().split('\n').map((l) => `  │ ${l}`).join('\n')));
      } else if (block.type === 'tool_use' && block.name) {
        console.log(chalk.dim(`  ⚙ ${block.name}`));
      }
    }
    return;
  }

  // Generic text event (codex plain output)
  if (typeof e.text === 'string' && e.text.trim() && !e.type) {
    console.log(chalk.gray(`  │ ${e.text.trim()}`));
  }
}

/** Format a duration in ms as "3m 42s". */
export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
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
