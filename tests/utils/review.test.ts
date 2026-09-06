import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadDocs,
  runExpertReview,
  resolveReviewer,
  ensureReviewerAvailable,
  describeReviewer,
  knownEfforts,
} from '../../src/utils/review.js';

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

  it('runs read-only with the reviewer model and effort', async () => {
    const backend = {
      name: 'claude',
      isAvailable: vi.fn(),
      execute: vi.fn().mockResolvedValue({ output: 'ok', sessionId: 'x', exitCode: 0 }),
      resume: vi.fn(),
    };

    await runExpertReview({
      backend,
      templateName: 'review',
      vars: { git_diff: 'diff' },
      model: 'opus',
      effort: 'high',
    });

    expect(backend.execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ readOnly: true, model: 'opus', effort: 'high' })
    );
  });

  it('omits Claude-only review tooling hints for the codex reviewer', async () => {
    const make = (name: string) => ({
      name,
      isAvailable: vi.fn(),
      execute: vi.fn().mockResolvedValue({ output: 'ok', sessionId: 'x', exitCode: 0 }),
      resume: vi.fn(),
    });
    const codex = make('codex');
    const claude = make('claude');

    await runExpertReview({ backend: codex, templateName: 'review', vars: { git_diff: 'diff' } });
    await runExpertReview({ backend: claude, templateName: 'review', vars: { git_diff: 'diff' } });

    const codexPrompt = codex.execute.mock.calls[0][0] as string;
    const claudePrompt = claude.execute.mock.calls[0][0] as string;
    expect(codexPrompt).not.toContain('/code-review');
    expect(codexPrompt).toContain('read-only');
    expect(claudePrompt).toContain('/code-review');
    expect(claudePrompt).toContain('read-only');
  });
});

describe('resolveReviewer', () => {
  const config = {
    mode: 'agent' as const,
    agent: { model: '', effort: '' },
    codex: { model: '', effort: '' },
  };

  it('defaults to an isolated claude reviewer with no overrides', () => {
    const r = resolveReviewer(config, undefined);
    expect(r.mode).toBe('agent');
    expect(r.backend.name).toBe('claude');
    expect(r.model).toBeUndefined();
    expect(r.effort).toBeUndefined();
  });

  it('uses the config model/effort of the selected mode', () => {
    const r = resolveReviewer(
      { ...config, mode: 'codex', codex: { model: 'gpt-5.5', effort: 'high' } },
      undefined
    );
    expect(r.backend.name).toBe('codex');
    expect(r.model).toBe('gpt-5.5');
    expect(r.effort).toBe('high');
  });

  it('prefers the per-feature choice over config', () => {
    const r = resolveReviewer(
      { ...config, agent: { model: 'sonnet', effort: 'low' } },
      { mode: 'agent', model: 'opus', effort: 'xhigh' }
    );
    expect(r.model).toBe('opus');
    expect(r.effort).toBe('xhigh');
  });

  it('prefers CLI flags over the per-feature choice', () => {
    const r = resolveReviewer(
      config,
      { mode: 'agent', model: 'opus' },
      { reviewModel: 'sonnet', reviewEffort: 'max' }
    );
    expect(r.model).toBe('sonnet');
    expect(r.effort).toBe('max');
  });

  it('does not leak a feature choice made for another mode', () => {
    const r = resolveReviewer(
      config,
      { mode: 'agent', model: 'opus', effort: 'max' },
      { reviewMode: 'codex' }
    );
    expect(r.backend.name).toBe('codex');
    expect(r.model).toBeUndefined();
    expect(r.effort).toBeUndefined();
  });

  it('rejects an unknown mode with the valid list', () => {
    expect(() => resolveReviewer(config, undefined, { reviewMode: 'gemini' })).toThrow(
      /Invalid review mode "gemini" \(valid: agent, codex\)/
    );
  });

  it('describes the reviewer with explicit values as-is', () => {
    const r = resolveReviewer(
      { ...config, mode: 'codex', codex: { model: 'gpt-5.5', effort: 'high' } },
      undefined
    );
    expect(describeReviewer(r, { source: 'x' })).toBe('codex · gpt-5.5 · effort high');
    expect(knownEfforts('agent')).toContain('max');
    expect(knownEfforts('codex')).toContain('xhigh');
  });

  it('fills unset model/effort from the CLI defaults and says so', () => {
    const codex = resolveReviewer({ ...config, mode: 'codex' }, undefined);
    expect(
      describeReviewer(codex, { model: 'gpt-5.6-sol', effort: 'xhigh', source: '~/.codex/config.toml' })
    ).toBe('codex · gpt-5.6-sol (codex default) · effort xhigh (codex default)');

    const partial = resolveReviewer({ ...config, mode: 'codex' }, { mode: 'codex', effort: 'low' });
    expect(describeReviewer(partial, { model: 'gpt-5.6-sol', effort: 'xhigh', source: 's' })).toBe(
      'codex · gpt-5.6-sol (codex default) · effort low'
    );

    const agent = resolveReviewer(config, undefined);
    expect(describeReviewer(agent, { source: 's' })).toBe('agent · claude default model · claude default effort');
    expect(describeReviewer(agent, { model: 'opus', source: 's' })).toBe(
      'agent · opus (claude default) · claude default effort'
    );
  });
});

describe('ensureReviewerAvailable', () => {
  afterEach(() => {
    process.exitCode = 0;
    vi.restoreAllMocks();
  });

  const backend = (name: string, available: boolean) => ({
    name,
    isAvailable: vi.fn().mockResolvedValue(available),
    execute: vi.fn(),
    resume: vi.fn(),
  });

  it('fails when the reviewer CLI is missing', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ok = await ensureReviewerAvailable({ backend: backend('codex', false), mode: 'codex' });
    expect(ok).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/codex.*not available/);
  });

  it('warns but passes an effort outside the known list through', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ok = await ensureReviewerAvailable({ backend: backend('codex', true), mode: 'codex', effort: 'turbo' });
    expect(ok).toBe(true);
    expect(process.exitCode).not.toBe(1);
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/"turbo"/);
  });
});
