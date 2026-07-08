import fs from 'node:fs';
import path from 'node:path';
import type { AIBackend, ExecuteOptions, ExecuteResult } from './interface.js';

const STDERR_TAIL_LINES = 20;

/**
 * Raised when a backend CLI run fails (non-zero exit or killed by a signal).
 * Carries the exit code, signal, and a stderr tail so the user sees the real
 * cause (expired auth, quota, timeout) instead of a silent empty result.
 */
export class BackendExecutionError extends Error {
  constructor(
    public readonly backend: string,
    public readonly exitCode: number,
    public readonly signal: string | null | undefined,
    public readonly stderrTail: string
  ) {
    const cause = signal ? `killed by ${signal} (timeout?)` : `exit code ${exitCode}`;
    super(
      `${backend} CLI failed: ${cause}` +
        (stderrTail ? `\n--- stderr (last ${STDERR_TAIL_LINES} lines) ---\n${stderrTail}` : '')
    );
    this.name = 'BackendExecutionError';
  }
}

/** Where to persist a run's raw output for later debugging. */
export interface RunLogTarget {
  dir: string;
  label: string;
}

/**
 * Execute (or resume) a prompt against a backend and enforce success.
 *
 * Backends are transport-only: they always resolve with the full process
 * result. This is the single place that turns a failed run into an error,
 * so no caller can accidentally treat an empty output from a crashed CLI
 * as a successful response. When a log target is given, the raw event
 * stream is persisted (spec §10.2) — especially on failure.
 */
export async function runPrompt(
  backend: AIBackend,
  prompt: string,
  opts?: ExecuteOptions & { sessionId?: string; log?: RunLogTarget }
): Promise<ExecuteResult> {
  const { sessionId, log, ...execOpts } = opts ?? {};
  const result = sessionId
    ? await backend.resume(sessionId, prompt, execOpts)
    : await backend.execute(prompt, execOpts);

  if (log) {
    writeRunLog(log, result);
  }

  if ((result.exitCode ?? 0) !== 0) {
    const tail = (result.stderr ?? '')
      .trim()
      .split('\n')
      .slice(-STDERR_TAIL_LINES)
      .join('\n');
    throw new BackendExecutionError(backend.name, result.exitCode, result.signal, tail);
  }

  return result;
}

/** Best-effort raw-output logging — must never break the run itself. */
function writeRunLog(log: RunLogTarget, result: ExecuteResult): void {
  try {
    fs.mkdirSync(log.dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(log.dir, `${ts}-${log.label}`);
    fs.writeFileSync(`${base}.jsonl`, result.raw ?? result.output ?? '', 'utf-8');
    if (result.stderr?.trim()) {
      fs.writeFileSync(`${base}.stderr.log`, result.stderr, 'utf-8');
    }
  } catch {
    // ignore logging failures
  }
}
