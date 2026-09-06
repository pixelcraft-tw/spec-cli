export interface ExecuteOptions {
  cwd?: string;
  timeout?: number;
  /**
   * Called for every parsed JSON event as it streams from the CLI, so long
   * runs show live progress instead of minutes of silence.
   */
  onEvent?: (event: Record<string, unknown>) => void;
  /** Model override handed to the CLI (claude alias/id, or codex model id). */
  model?: string;
  /** Effort / reasoning level; accepted values are CLI- and model-specific. */
  effort?: string;
  /** Forbid file edits — used for independent reviewer runs. */
  readOnly?: boolean;
}

export interface ExecuteResult {
  output: string;
  sessionId: string;
  exitCode: number;
  /** Raw stderr from the CLI process — surfaced in errors, never silently dropped. */
  stderr: string;
  /** Raw stdout (the full event stream) — persisted to .workflow/logs/ for debugging. */
  raw: string;
  /** Signal that killed the process (e.g. SIGTERM on timeout), if any. */
  signal?: string | null;
  /** Usage metadata from the CLI's result event, when available. */
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
}

export interface AIBackend {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult>;
  resume(sessionId: string, prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult>;
}
