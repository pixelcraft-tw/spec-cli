import { spawn, execFileSync } from 'node:child_process';
import type { AIBackend, ExecuteOptions, ExecuteResult } from './interface.js';

export class CodexBackend implements AIBackend {
  name = 'codex';

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('which', ['codex'], { encoding: 'utf-8' });
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

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
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
