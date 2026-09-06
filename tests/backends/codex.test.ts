import { describe, it, expect } from 'vitest';
import { parseCodexJson, buildCodexArgs } from '../../src/backends/codex.js';

// Golden-file style fixture captured from `codex exec --json` (codex-cli
// 0.144.1). This is the format-fragile boundary with the codex CLI — if the
// event format drifts, these tests catch it.
const STREAM = [
  JSON.stringify({ type: 'thread.started', thread_id: '01a07766-2c9d-75f2-8f8c-4e96ecafe2a5' }),
  JSON.stringify({ type: 'turn.started' }),
  JSON.stringify({
    type: 'item.completed',
    item: { id: 'item_0', type: 'agent_message', text: 'pong' },
  }),
  JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 17658, cached_input_tokens: 9984, output_tokens: 5, reasoning_output_tokens: 0 },
  }),
].join('\n');

describe('parseCodexJson', () => {
  it('extracts output, thread id, and turn count from a full stream', () => {
    const summary = parseCodexJson(STREAM);
    expect(summary.output).toBe('pong');
    expect(summary.sessionId).toBe('01a07766-2c9d-75f2-8f8c-4e96ecafe2a5');
    expect(summary.numTurns).toBe(1);
    expect(summary.errors).toEqual([]);
  });

  it('treats the last agent_message as the authoritative answer', () => {
    const stream = [
      JSON.stringify({ type: 'thread.started', thread_id: 't-1' }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Let me look at the files first.' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'git diff', exit_code: 0 } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Final verdict: PASS' } }),
      JSON.stringify({ type: 'turn.completed', usage: {} }),
    ].join('\n');
    const summary = parseCodexJson(stream);
    expect(summary.output).toBe('Final verdict: PASS');
  });

  it('surfaces error events so a failed turn is not mistaken for format drift', () => {
    const stream = [
      JSON.stringify({ type: 'thread.started', thread_id: 't-1' }),
      JSON.stringify({ type: 'error', message: 'quota exceeded' }),
      JSON.stringify({ type: 'turn.failed', error: { message: 'turn aborted' } }),
    ].join('\n');
    const summary = parseCodexJson(stream);
    expect(summary.output).toBe('');
    expect(summary.errors).toEqual(['quota exceeded', 'turn aborted']);
    expect(summary.numTurns).toBeUndefined();
  });

  it('skips non-JSON lines without failing', () => {
    const noisy = 'plain text noise\n' + STREAM + '\ntrailing garbage';
    const summary = parseCodexJson(noisy);
    expect(summary.output).toBe('pong');
  });

  it('returns empty summary for empty input', () => {
    const summary = parseCodexJson('');
    expect(summary.output).toBe('');
    expect(summary.sessionId).toBe('');
    expect(summary.numTurns).toBeUndefined();
  });
});

describe('buildCodexArgs', () => {
  it('adds nothing when no reviewer options are set', () => {
    expect(buildCodexArgs()).toEqual([]);
    expect(buildCodexArgs({})).toEqual([]);
  });

  it('maps model, effort and read-only to CLI flags', () => {
    expect(buildCodexArgs({ model: 'gpt-5.5', effort: 'high', readOnly: true })).toEqual([
      '-m', 'gpt-5.5',
      // bare value: kept as a string literal by codex, and no quotes for cmd.exe to strip
      '-c', 'model_reasoning_effort=high',
      '-s', 'read-only',
    ]);
  });

  it('passes newer effort levels through — the CLI has the final say', () => {
    expect(buildCodexArgs({ effort: 'ultra' })).toEqual(['-c', 'model_reasoning_effort=ultra']);
  });

  it('rejects values that are unsafe for argv', () => {
    expect(() => buildCodexArgs({ model: 'gpt-5.5 && cat /etc/passwd' })).toThrow(/Invalid codex model/);
    expect(() => buildCodexArgs({ effort: 'high"' })).toThrow(/Invalid codex effort/);
  });
});
