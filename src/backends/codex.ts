import { spawn, execFileSync } from 'node:child_process';
import type { AIBackend, ExecuteOptions, ExecuteResult } from './interface.js';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Reasoning levels commonly supported by codex models. Newer models add
 * levels (e.g. `max`, `ultra`), so this list drives prompts and warnings —
 * it is not a hard reject; the CLI has the final say.
 */
export const CODEX_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const SAFE_ARG_VALUE = /^[A-Za-z0-9._:-]+$/;

/**
 * Extra argv for model / effort / read-only runs. Values are validated
 * because they enter argv (shell mode on win32). Exported for unit tests.
 */
export function buildCodexArgs(opts?: ExecuteOptions): string[] {
  const args: string[] = [];
  if (opts?.model) {
    if (!SAFE_ARG_VALUE.test(opts.model)) throw new Error(`Invalid codex model: "${opts.model}"`);
    args.push('-m', opts.model);
  }
  if (opts?.effort) {
    if (!SAFE_ARG_VALUE.test(opts.effort)) throw new Error(`Invalid codex effort: "${opts.effort}"`);
    // Bare value on purpose: codex keeps a non-TOML value as a string
    // literal, and no quotes means cmd.exe cannot strip them on win32.
    args.push('-c', `model_reasoning_effort=${opts.effort}`);
  }
  if (opts?.readOnly) {
    // OS-level sandbox: the reviewer cannot write anywhere in the worktree.
    args.push('-s', 'read-only');
  }
  return args;
}

export interface CodexJsonSummary {
  output: string;
  sessionId: string;
  numTurns?: number;
  /** Error events from the stream — a failed turn can still exit 0. */
  errors: string[];
}

/**
 * Parse `codex exec --json` output (one JSON event per line):
 *   {"type":"thread.started","thread_id":"…"}
 *   {"type":"item.completed","item":{"type":"agent_message","text":"…"}}
 *   {"type":"turn.completed","usage":{…}}
 *
 * The LAST agent_message is the authoritative answer — the same semantics as
 * the CLI's own `--output-last-message` — so interim commentary never leaks
 * into saved reviews. Exported for golden-file tests: this is the
 * format-fragile boundary with the codex CLI.
 */
export function parseCodexJson(raw: string): CodexJsonSummary {
  const summary: CodexJsonSummary = { output: '', sessionId: '', errors: [] };
  let turns = 0;

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line);
    } catch {
      continue; // Not JSON, skip
    }

    const item = json.item as { type?: string; text?: string } | undefined;
    switch (json.type) {
      case 'thread.started':
        if (typeof json.thread_id === 'string') summary.sessionId = json.thread_id;
        break;
      case 'item.completed':
        if (item?.type === 'agent_message' && typeof item.text === 'string') {
          summary.output = item.text;
        }
        break;
      case 'turn.completed':
        turns++;
        break;
      case 'turn.failed':
      case 'error': {
        const err = json.error as { message?: string } | undefined;
        summary.errors.push(String(json.message ?? err?.message ?? line));
        break;
      }
    }
  }

  if (turns > 0) summary.numTurns = turns;
  return summary;
}

export class CodexBackend implements AIBackend {
  name = 'codex';

  async isAvailable(): Promise<boolean> {
    try {
      execFileSync(IS_WINDOWS ? 'where' : 'which', ['codex'], { encoding: 'utf-8' });
      return true;
    } catch {
      return false;
    }
  }

  async execute(prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    // `-` = read the prompt from stdin
    return this._run(['codex', 'exec', '--json', ...buildCodexArgs(opts), '-'], prompt, opts);
  }

  async resume(sessionId: string, prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    // Session ids come from parsed CLI output; validate before they re-enter
    // argv (defense in depth for win32 shell mode)
    if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      throw new Error(`Invalid session id: "${sessionId}"`);
    }
    return this._run(
      ['codex', 'exec', 'resume', '--json', ...buildCodexArgs(opts), sessionId, '-'],
      prompt,
      opts
    );
  }

  private _run(args: string[], prompt: string, opts?: ExecuteOptions): Promise<ExecuteResult> {
    const [cmd, ...cmdArgs] = args;
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, cmdArgs, {
        cwd: opts?.cwd ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: opts?.timeout,
        // win32: codex is a .cmd shim that Node cannot spawn directly.
        // Safe with shell because argv holds only fixed flags + validated
        // values — the prompt goes through stdin, never the shell.
        shell: IS_WINDOWS,
      });

      // Prompt via stdin: argv has OS size limits (~256KB single-arg on
      // macOS) that a large diff + spec prompt can exceed; stdin has none.
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
        const summary = parseCodexJson(stdout);
        // Surface stream-level errors where runPrompt already looks for
        // causes, instead of letting an empty output read as format drift.
        if (summary.errors.length > 0) {
          stderr += (stderr.endsWith('\n') || !stderr ? '' : '\n') + summary.errors.join('\n') + '\n';
        }
        resolve({
          output: summary.output,
          sessionId: summary.sessionId,
          exitCode: code ?? 1,
          stderr,
          raw: stdout,
          signal,
          // codex reports tokens but no cost; duration is measured here so
          // usage tracking still counts the run.
          durationMs: Date.now() - startedAt,
          numTurns: summary.numTurns,
        });
      });

      child.on('error', (err) => {
        reject(new Error(`Codex CLI error: ${err.message}`));
      });
    });
  }
}
