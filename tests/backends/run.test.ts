import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runPrompt, BackendExecutionError, BackendFormatError } from '../../src/backends/run.js';

function makeBackend(result: Record<string, unknown>) {
  return {
    name: 'claude',
    isAvailable: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(result),
    resume: vi.fn().mockResolvedValue(result),
  };
}

const ok = { output: 'hello', sessionId: 's1', exitCode: 0, stderr: '' };

describe('runPrompt', () => {
  it('returns the result on success', async () => {
    const backend = makeBackend(ok);
    const result = await runPrompt(backend, 'do it');
    expect(result.output).toBe('hello');
    expect(backend.execute).toHaveBeenCalledWith('do it', {});
    expect(backend.resume).not.toHaveBeenCalled();
  });

  it('resumes when a sessionId is given', async () => {
    const backend = makeBackend(ok);
    await runPrompt(backend, 'continue', { sessionId: 'sess-42' });
    expect(backend.resume).toHaveBeenCalledWith('sess-42', 'continue', {});
    expect(backend.execute).not.toHaveBeenCalled();
  });

  it('throws BackendExecutionError on non-zero exit with the stderr tail', async () => {
    const backend = makeBackend({
      output: '',
      sessionId: '',
      exitCode: 2,
      stderr: 'line1\nAPI quota exceeded',
    });

    const err = await runPrompt(backend, 'do it').catch((e) => e);
    expect(err).toBeInstanceOf(BackendExecutionError);
    expect(err.message).toContain('claude CLI failed: exit code 2');
    expect(err.message).toContain('API quota exceeded');
    expect(err.exitCode).toBe(2);
  });

  it('reports signal kills (e.g. timeout SIGTERM)', async () => {
    const backend = makeBackend({
      output: 'partial',
      sessionId: '',
      exitCode: 1,
      stderr: '',
      signal: 'SIGTERM',
    });

    const err = await runPrompt(backend, 'do it').catch((e) => e);
    expect(err).toBeInstanceOf(BackendExecutionError);
    expect(err.message).toContain('killed by SIGTERM');
  });

  it('tolerates mocks/backends without an explicit exitCode', async () => {
    const backend = makeBackend({ output: 'hi', sessionId: 's', stderr: '' });
    const result = await runPrompt(backend, 'do it');
    expect(result.output).toBe('hi');
  });

  it('detects output-format drift: exit 0, raw data, nothing parseable', async () => {
    const backend = makeBackend({
      output: '',
      sessionId: '',
      exitCode: 0,
      stderr: '',
      raw: '{"type":"unknown-new-event"}',
    });

    const err = await runPrompt(backend, 'do it').catch((e) => e);
    expect(err).toBeInstanceOf(BackendFormatError);
    expect(err.message).toContain('version incompatibility');
  });

  it('persists the raw event stream when a log target is given', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-logs-'));
    const backend = makeBackend({ ...ok, raw: '{"type":"result"}' });

    await runPrompt(backend, 'do it', { log: { dir, label: 'task-1-implement' } });

    const files = fs.readdirSync(dir);
    expect(files.some((f) => f.endsWith('-task-1-implement.jsonl'))).toBe(true);
    const logFile = files.find((f) => f.endsWith('.jsonl'))!;
    expect(fs.readFileSync(path.join(dir, logFile), 'utf-8')).toBe('{"type":"result"}');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('logs raw output and stderr even when the run fails', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-logs-'));
    const backend = makeBackend({
      output: '',
      sessionId: '',
      exitCode: 1,
      stderr: 'quota exceeded',
      raw: 'partial stream',
    });

    await expect(
      runPrompt(backend, 'do it', { log: { dir, label: 'task-1-implement' } })
    ).rejects.toThrow(BackendExecutionError);

    const files = fs.readdirSync(dir);
    expect(files.some((f) => f.endsWith('.jsonl'))).toBe(true);
    expect(files.some((f) => f.endsWith('.stderr.log'))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
