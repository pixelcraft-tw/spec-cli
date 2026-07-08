import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadDocs, runExpertReview } from '../../src/utils/review.js';

describe('loadDocs', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-docs-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a placeholder when no docs are provided', () => {
    expect(loadDocs(undefined)).toBe('(none provided)');
    expect(loadDocs([])).toBe('(none provided)');
  });

  it('reads provided documents and labels them by path', () => {
    const docPath = path.join(tmpDir, 'api.md');
    fs.writeFileSync(docPath, 'API contract here');

    const out = loadDocs([docPath]);
    expect(out).toContain(`### ${docPath}`);
    expect(out).toContain('API contract here');
  });

  it('does not throw on unreadable files', () => {
    const out = loadDocs([path.join(tmpDir, 'missing.md')]);
    expect(out).toContain('(could not read file)');
  });
});

describe('runExpertReview', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-expert-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.workflow', 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.workflow', 'prompts', 'review.md'),
      'Review:\n{git_diff}'
    );
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses a fresh session (execute), never resume', async () => {
    const backend = {
      name: 'claude',
      isAvailable: vi.fn(),
      execute: vi.fn().mockResolvedValue({ output: 'verdict: PASS', sessionId: 'x', exitCode: 0 }),
      resume: vi.fn(),
    };

    const out = await runExpertReview({
      backend,
      templateName: 'review',
      vars: { git_diff: 'diff' },
    });

    expect(out.output).toBe('verdict: PASS');
    expect(backend.execute).toHaveBeenCalledTimes(1);
    expect(backend.resume).not.toHaveBeenCalled();
  });
});
