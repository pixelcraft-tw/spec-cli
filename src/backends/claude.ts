import { spawn, execFileSync } from 'node:child_process';
import type { AIBackend, ExecuteOptions, ExecuteResult } from './interface.js';

export class ClaudeBackend implements AIBackend {
  name = 'claude';

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync('which', ['claude'], { encoding: 'utf-8' });
      return true;
    } catch {
      return false;
    }
  }

  async execute(prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    return this._run(['claude', '-p', prompt, '--output-format', 'stream-json'], opts);
  }

  async resume(sessionId: string, prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    return this._run(
      ['claude', '-p', prompt, '--resume', sessionId, '--output-format', 'stream-json'],
      opts
    );
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
        const result = this._parseStreamJson(stdout);
        resolve({
          output: result.output,
          sessionId: result.sessionId,
          exitCode: code ?? 1,
          stderr,
          signal,
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Claude CLI error: ${err.message}`));
      });
    });
  }

  private _parseStreamJson(raw: string): { output: string; sessionId: string } {
    let output = '';
    let sessionId = '';

    const lines = raw.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'assistant' && json.message?.content) {
          for (const block of json.message.content) {
            if (block.type === 'text') {
              output += block.text;
            }
          }
        }
        if (json.session_id) {
          sessionId = json.session_id;
        }
        // Also check result message
        if (json.type === 'result' && json.result) {
          output = json.result;
        }
        if (json.type === 'result' && json.session_id) {
          sessionId = json.session_id;
        }
      } catch {
        // Not JSON, skip
      }
    }

    return { output, sessionId };
  }
}
