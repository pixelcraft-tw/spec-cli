import { describe, it, expect, vi } from 'vitest';
import { runPrompt, BackendExecutionError } from '../../src/backends/run.js';

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
});
