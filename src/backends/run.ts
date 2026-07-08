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

/**
 * Execute (or resume) a prompt against a backend and enforce success.
 *
 * Backends are transport-only: they always resolve with the full process
 * result. This is the single place that turns a failed run into an error,
 * so no caller can accidentally treat an empty output from a crashed CLI
 * as a successful response.
 */
export async function runPrompt(
  backend: AIBackend,
  prompt: string,
  opts?: ExecuteOptions & { sessionId?: string }
): Promise<ExecuteResult> {
  const { sessionId, ...execOpts } = opts ?? {};
  const result = sessionId
    ? await backend.resume(sessionId, prompt, execOpts)
    : await backend.execute(prompt, execOpts);

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
