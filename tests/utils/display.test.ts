import { describe, it, expect, afterEach, vi } from 'vitest';
import * as display from '../../src/utils/display.js';

describe('display.error', () => {
  afterEach(() => {
    process.exitCode = 0;
  });

  it('marks the process as failed so scripts and CI can detect it', () => {
    process.exitCode = 0;
    display.error('boom');
    expect(process.exitCode).toBe(1);
  });
});

describe('display.renderBackendEvent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders claude assistant text and tool calls', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    display.renderBackendEvent({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'thinking aloud' }, { type: 'tool_use', name: 'Read' }] },
    });
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('thinking aloud');
    expect(printed).toContain('Read');
  });

  it('renders codex item.completed agent messages and commands', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    display.renderBackendEvent({ type: 'item.completed', item: { type: 'agent_message', text: 'Final verdict: PASS' } });
    display.renderBackendEvent({ type: 'item.completed', item: { type: 'command_execution', command: 'git diff' } });
    const printed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('Final verdict: PASS');
    expect(printed).toContain('git diff');
  });

  it('ignores codex events that carry no user-facing text', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    display.renderBackendEvent({ type: 'turn.started' });
    display.renderBackendEvent({ type: 'item.started', item: { type: 'agent_message', text: 'partial' } });
    expect(log).not.toHaveBeenCalled();
  });
});
