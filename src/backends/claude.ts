import { spawn, execFileSync } from 'node:child_process';
import type { AIBackend, ExecuteOptions, ExecuteResult } from './interface.js';

const IS_WINDOWS = process.platform === 'win32';

/** Effort levels documented by `claude --help`; used for prompts and warnings. */
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const READ_ONLY_DISALLOWED_TOOLS = 'Edit,Write,MultiEdit,NotebookEdit';
const SAFE_ARG_VALUE = /^[A-Za-z0-9._:-]+$/;

/**
 * Extra argv for model / effort / read-only runs. Values are validated
 * because they enter argv (shell mode on win32). Exported for unit tests.
 */
export function buildClaudeArgs(opts?: ExecuteOptions): string[] {
  const args: string[] = [];
  if (opts?.model) {
    if (!SAFE_ARG_VALUE.test(opts.model)) throw new Error(`Invalid claude model: "${opts.model}"`);
    args.push('--model', opts.model);
  }
  if (opts?.effort) {
    if (!SAFE_ARG_VALUE.test(opts.effort)) throw new Error(`Invalid claude effort: "${opts.effort}"`);
    args.push('--effort', opts.effort);
  }
  if (opts?.readOnly) {
    // Hard gate against the editor tools. Bash stays available so a reviewer
    // can run git and tests — writing through the shell is a known gap.
    args.push('--disallowedTools', READ_ONLY_DISALLOWED_TOOLS);
  }
  return args;
}

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
      execFileSync(IS_WINDOWS ? 'where' : 'which', ['claude'], { encoding: 'utf-8' });
      return true;
    } catch {
      return false;
    }
  }

  async execute(prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    // --verbose is required for stream-json in print mode
    return this._run(
      ['claude', '-p', '--output-format', 'stream-json', '--verbose', ...buildClaudeArgs(opts)],
      prompt,
      opts
    );
  }

  async resume(sessionId: string, prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    // Session ids come from parsed CLI output; validate before they re-enter
    // argv (defense in depth for win32 shell mode)
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      throw new Error(`Invalid session id: "${sessionId}"`);
    }
    return this._run(
      ['claude', '-p', '--resume', sessionId, '--output-format', 'stream-json', '--verbose', ...buildClaudeArgs(opts)],
      prompt,
      opts
    );
  }

  private _run(args: string[], prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    const [cmd, ...cmdArgs] = args;
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, cmdArgs, {
        cwd: opts?.cwd ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: opts?.timeout,
        // win32: claude is a .cmd shim that Node cannot spawn directly.
        // Safe with shell because argv holds only fixed flags + validated
        // session id — the prompt goes through stdin, never the shell.
        shell: IS_WINDOWS,
      });

      // Prompt via stdin: argv has OS size limits (~256KB single-arg on
      // macOS) that a large spec + plan prompt can exceed; stdin has none.
      child.stdin.on('error', () => {
        // EPIPE when the CLI exits before reading — close event reports it
      });
      child.stdin.write(prompt);
      child.stdin.end();

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
