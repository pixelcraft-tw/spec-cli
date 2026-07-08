import { spawn, execFileSync } from 'node:child_process';
import type { AIBackend, ExecuteOptions, ExecuteResult } from './interface.js';

export interface StreamJsonSummary {
  output: string;
  sessionId: string;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
}

/**
 * Parse the claude CLI stream-json output (one JSON event per line).
 * Exported for testability — this is the most format-fragile part of the
 * backend and must be covered by golden-file tests.
 */
export function parseStreamJson(raw: string): StreamJsonSummary {
  const summary: StreamJsonSummary = { output: '', sessionId: '' };

  const lines = raw.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json.type === 'assistant' && json.message?.content) {
        for (const block of json.message.content) {
          if (block.type === 'text') {
            summary.output += block.text;
          }
        }
      }
      if (json.session_id) {
        summary.sessionId = json.session_id;
      }
      // The final result message carries the authoritative output + usage
      if (json.type === 'result') {
        if (typeof json.result === 'string') summary.output = json.result;
        if (typeof json.total_cost_usd === 'number') summary.costUsd = json.total_cost_usd;
        if (typeof json.duration_ms === 'number') summary.durationMs = json.duration_ms;
        if (typeof json.num_turns === 'number') summary.numTurns = json.num_turns;
      }
    } catch {
      // Not JSON, skip
    }
  }

  return summary;
}

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
    // --verbose is required for stream-json in print mode
    return this._run(
      ['claude', '-p', prompt, '--output-format', 'stream-json', '--verbose'],
      opts
    );
  }

  async resume(sessionId: string, prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    return this._run(
      ['claude', '-p', prompt, '--resume', sessionId, '--output-format', 'stream-json', '--verbose'],
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
      let lineBuf = '';

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        if (!opts?.onEvent) return;
        // Emit complete JSONL events as they stream in
        lineBuf += chunk;
        let nl: number;
        while ((nl = lineBuf.indexOf('\n')) >= 0) {
          const line = lineBuf.slice(0, nl).trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (!line) continue;
          try {
            opts.onEvent(JSON.parse(line));
          } catch {
            // Not JSON, skip
          }
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code, signal) => {
        const summary = parseStreamJson(stdout);
        resolve({
          output: summary.output,
          sessionId: summary.sessionId,
          exitCode: code ?? 1,
          stderr,
          raw: stdout,
          signal,
          costUsd: summary.costUsd,
          durationMs: summary.durationMs,
          numTurns: summary.numTurns,
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Claude CLI error: ${err.message}`));
      });
    });
  }
}
