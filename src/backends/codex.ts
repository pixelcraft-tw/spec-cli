import { spawn, execFileSync } from 'node:child_process';
import type { AIBackend, ExecuteOptions, ExecuteResult } from './interface.js';

// NOTE: the codex backend spawns without a shell and passes the prompt via
// argv, so it is POSIX-only (on Windows the .cmd shim cannot be spawned
// directly, and shell mode would be unsafe with an arbitrary prompt in argv).
export class CodexBackend implements AIBackend {
  name = 'codex';

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], {
        encoding: 'utf-8',
      });
      return true;
    } catch {
      return false;
    }
  }

  async execute(prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    return this._run(['codex', 'exec', prompt, '--json'], opts);
  }

  async resume(sessionId: string, prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    return this._run(['codex', 'exec', 'resume', sessionId, prompt], opts);
  }

  private _run(args: string[], opts?: ExecuteOptions): Promise<ExecuteResult> {
    const [cmd, ...cmdArgs] = args;
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, cmdArgs, {
        cwd: opts?.cwd ?? process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: opts?.timeout,
      });

      let stdout = '';
      let stderr = '';
      let lineBuf = '';

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        if (!opts?.onEvent) return;
        lineBuf += chunk;
        let nl: number;
        while ((nl = lineBuf.indexOf('\n')) >= 0) {
          const line = lineBuf.slice(0, nl).trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (!line) continue;
          try {
            opts.onEvent(JSON.parse(line));
          } catch {
            // Plain text line — surface it as a text event
            opts.onEvent({ text: line });
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code, signal) => {
        const result = this._parseJsonl(stdout);
        resolve({
          output: result.output,
          sessionId: result.sessionId,
          exitCode: code ?? 1,
          stderr,
          raw: stdout,
          signal,
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Codex CLI error: ${err.message}`));
      });
    });
  }

  private _parseJsonl(raw: string): { output: string; sessionId: string } {
    let output = '';
    let sessionId = '';

    const lines = raw.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.output) output += json.output;
        if (json.text) output += json.text;
        if (json.session_id) sessionId = json.session_id;
        if (json.id) sessionId = json.id;
      } catch {
        // Plain text fallback
        output += line + '\n';
      }
    }

    return { output: output.trim(), sessionId };
  }
}
