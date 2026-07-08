export interface ExecuteOptions {
  cwd?: string;
  timeout?: number;
}

export interface ExecuteResult {
  output: string;
  sessionId: string;
  exitCode: number;
  /** Raw stderr from the CLI process — surfaced in errors, never silently dropped. */
  stderr: string;
  /** Signal that killed the process (e.g. SIGTERM on timeout), if any. */
  signal?: string | null;
}

export interface AIBackend {
  name: string;
  isAvailable(): Promise<boolean>;
  execute(prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult>;
  resume(sessionId: string, prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult>;
}
