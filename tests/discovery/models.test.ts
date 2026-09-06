import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { codexModelChoices, codexDefaults, claudeDefaults, CODEX_MODEL_FALLBACK, CLAUDE_MODEL_CHOICES } from '../../src/discovery/models.js';

describe('codexModelChoices', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-models-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists only picker-visible models in CLI order with their effort levels', () => {
    // Shape captured from ~/.codex/models_cache.json (codex-cli 0.144.1)
    fs.writeFileSync(
      path.join(tmpDir, 'models_cache.json'),
      JSON.stringify({
        models: [
          { slug: 'gpt-hidden', visibility: 'hide', priority: 1 },
          {
            slug: 'gpt-5.5',
            visibility: 'list',
            priority: 12,
            supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }],
          },
          {
            slug: 'gpt-5.6-sol',
            visibility: 'list',
            priority: 6,
            supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, { effort: 'max' }, { effort: 'ultra' }],
          },
          { slug: 'gpt-5.4-mini', visibility: 'list', priority: 23 },
        ],
      })
    );

    const choices = codexModelChoices(tmpDir);
    expect(choices.map((c) => c.id)).toEqual(['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.4-mini']);
    expect(choices[0].efforts).toEqual(['low', 'high', 'max', 'ultra']);
    expect(choices[2].efforts).toBeUndefined();
  });

  it('falls back to the static list when the cache is missing', () => {
    expect(codexModelChoices(tmpDir)).toBe(CODEX_MODEL_FALLBACK);
  });

  it('falls back to the static list when the cache is malformed or empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'models_cache.json'), '{not json');
    expect(codexModelChoices(tmpDir)).toBe(CODEX_MODEL_FALLBACK);

    fs.writeFileSync(path.join(tmpDir, 'models_cache.json'), JSON.stringify({ models: [] }));
    expect(codexModelChoices(tmpDir)).toBe(CODEX_MODEL_FALLBACK);
  });

  it('offers the claude aliases as fixed choices', () => {
    expect(CLAUDE_MODEL_CHOICES.map((c) => c.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
  });
});

describe('codexDefaults / claudeDefaults', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxs-defaults-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads top-level model and effort from codex config.toml, ignoring tables', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.toml'),
      [
        'model = "gpt-5.6-sol"',
        'model_reasoning_effort = "xhigh"',
        'approvals_reviewer = "user"',
        '',
        '[profiles.fast]',
        'model = "gpt-5.4-mini"',
        'model_reasoning_effort = "low"',
      ].join('\n')
    );
    const d = codexDefaults(tmpDir);
    expect(d.model).toBe('gpt-5.6-sol');
    expect(d.effort).toBe('xhigh');
    expect(d.source).toBe('~/.codex/config.toml');
  });

  it('returns only the source when codex config is missing', () => {
    expect(codexDefaults(tmpDir)).toEqual({ source: '~/.codex/config.toml' });
  });

  it('reads a pinned model from claude settings.json and nothing else', () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({ model: 'opus', permissions: {} }));
    expect(claudeDefaults(tmpDir)).toEqual({ model: 'opus', source: '~/.claude/settings.json' });
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({ permissions: {} }));
    expect(claudeDefaults(tmpDir)).toEqual({ source: '~/.claude/settings.json' });
  });
});
