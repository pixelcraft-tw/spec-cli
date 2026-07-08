import { describe, it, expect } from 'vitest';
import { parseStreamJson } from '../../src/backends/claude.js';

// Golden-file style fixture: this is the format-fragile boundary with the
// claude CLI — if the stream-json format drifts, these tests catch it.
const STREAM = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-abc' }),
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'working on it' }] },
    session_id: 'sess-abc',
  }),
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Edit', input: {} }] },
    session_id: 'sess-abc',
  }),
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'final answer',
    session_id: 'sess-abc',
    total_cost_usd: 0.1234,
    duration_ms: 45000,
    num_turns: 7,
  }),
].join('\n');

describe('parseStreamJson', () => {
  it('extracts output, session id, and usage from a full stream', () => {
    const summary = parseStreamJson(STREAM);
    // The result event's output is authoritative
    expect(summary.output).toBe('final answer');
    expect(summary.sessionId).toBe('sess-abc');
    expect(summary.costUsd).toBe(0.1234);
    expect(summary.durationMs).toBe(45000);
    expect(summary.numTurns).toBe(7);
  });

  it('falls back to assistant text when no result event exists', () => {
    const partial = STREAM.split('\n').slice(0, 2).join('\n');
    const summary = parseStreamJson(partial);
    expect(summary.output).toBe('working on it');
    expect(summary.sessionId).toBe('sess-abc');
    expect(summary.costUsd).toBeUndefined();
  });

  it('skips non-JSON lines without failing', () => {
    const noisy = 'plain text noise\n' + STREAM + '\ntrailing garbage';
    const summary = parseStreamJson(noisy);
    expect(summary.output).toBe('final answer');
  });

  it('returns empty summary for empty input', () => {
    const summary = parseStreamJson('');
    expect(summary.output).toBe('');
    expect(summary.sessionId).toBe('');
  });
});
