import { describe, it, expect } from 'vitest';
import { parseCodexJson } from '../../src/backends/codex.js';

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
