import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ModelChoice {
  /** Value passed to the CLI (`--model` / `-m`). */
  id: string;
  /** Label shown in prompts. */
  label: string;
  /** Effort levels this model supports, when known. */
  efforts?: string[];
}

/** Claude Code model aliases — each resolves to the latest of its family. */
export const CLAUDE_MODEL_CHOICES: ModelChoice[] = [
  { id: 'fable', label: 'fable (most capable)' },
  { id: 'opus', label: 'opus' },
  { id: 'sonnet', label: 'sonnet (faster)' },
  { id: 'haiku', label: 'haiku (fastest)' },
];

/** Used when the codex model cache is missing or unreadable. */
export const CODEX_MODEL_FALLBACK: ModelChoice[] = [
  { id: 'gpt-5.5', label: 'gpt-5.5' },
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
  { id: 'gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark' },
];

export function defaultCodexHome(): string {
  return process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
}

/**
 * Models the local codex CLI offers, read from the cache it maintains at
 * `$CODEX_HOME/models_cache.json`. Only models the CLI lists in its own
 * picker are returned, in the CLI's order, each with the reasoning levels
 * it supports. The cache format is undocumented, so parsing is defensive
 * and falls back to a short static list rather than ever throwing.
 */
export function codexModelChoices(codexHome: string = defaultCodexHome()): ModelChoice[] {
  try {
    const raw = fs.readFileSync(path.join(codexHome, 'models_cache.json'), 'utf-8');
    const data = JSON.parse(raw) as { models?: unknown };
    if (!Array.isArray(data.models)) return CODEX_MODEL_FALLBACK;

    const choices = (data.models as Array<Record<string, unknown>>)
      .filter((m) => typeof m.slug === 'string' && m.visibility === 'list')
      .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))
      .map((m) => {
        const levels = Array.isArray(m.supported_reasoning_levels)
          ? (m.supported_reasoning_levels as Array<{ effort?: unknown }>)
              .map((l) => l.effort)
              .filter((e): e is string => typeof e === 'string')
          : [];
        return {
          id: m.slug as string,
          label: m.slug as string,
          ...(levels.length > 0 ? { efforts: levels } : {}),
        };
      });

    return choices.length > 0 ? choices : CODEX_MODEL_FALLBACK;
  } catch {
    return CODEX_MODEL_FALLBACK;
  }
}

/** What a CLI will use when pxs passes no model/effort — for display only. */
export interface CliDefaults {
  model?: string;
  effort?: string;
  /** Where the values were read from, for the user's benefit. */
  source: string;
}

/**
 * Top-level `model` / `model_reasoning_effort` from `$CODEX_HOME/config.toml`,
 * i.e. what `codex exec` uses when pxs passes neither `-m` nor an effort.
 * Only keys before the first `[table]` count (profiles and projects have
 * their own). Missing or unreadable config → codex built-in defaults, which
 * we cannot see.
 */
export function codexDefaults(codexHome: string = defaultCodexHome()): CliDefaults {
  const out: CliDefaults = { source: '~/.codex/config.toml' };
  try {
    const raw = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf-8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t.startsWith('[')) break;
      const m = /^(model|model_reasoning_effort)\s*=\s*"([^"]*)"/.exec(t);
      if (!m || !m[2]) continue;
      if (m[1] === 'model') out.model = m[2];
      else out.effort = m[2];
    }
  } catch {
    // no config file: codex falls back to its built-in defaults
  }
  return out;
}

/**
 * `model` from `~/.claude/settings.json` when the user pinned one. Claude
 * Code has no user-level effort setting we can read, so effort stays unknown.
 */
export function claudeDefaults(
  claudeHome: string = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude')
): CliDefaults {
  const out: CliDefaults = { source: '~/.claude/settings.json' };
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(claudeHome, 'settings.json'), 'utf-8'));
    if (typeof settings?.model === 'string' && settings.model) out.model = settings.model;
  } catch {
    // no settings file: claude uses its built-in default model
  }
  return out;
}
