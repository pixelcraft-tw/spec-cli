import fs from 'node:fs';
import type { AIBackend } from '../backends/interface.js';
import { runPrompt, type RunLogTarget } from '../backends/run.js';
import { createBackend } from '../backends/factory.js';
import { CLAUDE_EFFORTS } from '../backends/claude.js';
import { CODEX_EFFORTS } from '../backends/codex.js';
import { REVIEW_MODES, type ProjectConfig, type ReviewChoice, type ReviewMode } from '../state/types.js';
import { assemblePrompt } from './prompt.js';
import * as display from './display.js';

/**
 * Read developer-provided reference documents into a single markdown block.
 * Returns a placeholder when no docs are given so templates render cleanly.
 */
export function loadDocs(paths: string[] | undefined): string {
  if (!paths || paths.length === 0) return '(none provided)';

  const parts: string[] = [];
  for (const p of paths) {
    try {
      parts.push(`### ${p}\n${fs.readFileSync(p, 'utf-8')}`);
    } catch {
      parts.push(`### ${p}\n(could not read file)`);
    }
  }
  return parts.join('\n\n');
}

/** The independent reviewer: its own backend, model and effort. */
export interface Reviewer {
  backend: AIBackend;
  mode: ReviewMode;
  model?: string;
  effort?: string;
}

export interface ReviewFlags {
  reviewMode?: string;
  reviewModel?: string;
  reviewEffort?: string;
}

/** Effort levels known for a review mode (prompt choices and warnings only). */
export function knownEfforts(mode: ReviewMode): string[] {
  return mode === 'codex' ? CODEX_EFFORTS : CLAUDE_EFFORTS;
}

/**
 * Pick the independent reviewer.
 * Precedence: CLI flags > per-feature choice (state.yaml) > project config.
 * Pure: no availability check — commands do that in preflight so a missing
 * CLI fails before any AI run. Throws on an unknown mode.
 */
export function resolveReviewer(
  config: ProjectConfig['review'],
  feature: ReviewChoice | undefined,
  flags: ReviewFlags = {}
): Reviewer {
  const mode = flags.reviewMode ?? feature?.mode ?? config.mode;
  if (!REVIEW_MODES.includes(mode as ReviewMode)) {
    throw new Error(`Invalid review mode "${mode}" (valid: ${REVIEW_MODES.join(', ')})`);
  }
  const resolvedMode = mode as ReviewMode;
  const perMode = resolvedMode === 'codex' ? config.codex : config.agent;
  // A feature-level choice made for a different mode must not leak its
  // model/effort into this mode (e.g. --review-mode codex over an agent choice)
  const featureChoice = feature?.mode === resolvedMode ? feature : undefined;
  const model = flags.reviewModel ?? featureChoice?.model ?? perMode.model;
  const effort = flags.reviewEffort ?? featureChoice?.effort ?? perMode.effort;

  return {
    backend: createBackend(resolvedMode === 'codex' ? 'codex' : 'claude'),
    mode: resolvedMode,
    model: model || undefined,
    effort: effort || undefined,
  };
}

/** One-line label for progress output, e.g. "codex · gpt-5.5 · effort high". */
export function describeReviewer(reviewer: Reviewer): string {
  const parts: string[] = [reviewer.mode];
  if (reviewer.model) parts.push(reviewer.model);
  if (reviewer.effort) parts.push(`effort ${reviewer.effort}`);
  return parts.join(' · ');
}

/**
 * Preflight for commands: the reviewer CLI must exist before any implement
 * run starts, otherwise a task would be implemented and then left without a
 * review. Returns false after printing the error. An effort outside the
 * known list only warns — newer models accept more levels and the CLI has
 * the final say.
 */
export async function ensureReviewerAvailable(reviewer: Reviewer): Promise<boolean> {
  if (!(await reviewer.backend.isAvailable())) {
    display.error(
      `Reviewer backend "${reviewer.backend.name}" not available (review mode "${reviewer.mode}"). ` +
        'Install it or pick another mode with --review-mode.'
    );
    return false;
  }
  if (reviewer.effort && !knownEfforts(reviewer.mode).includes(reviewer.effort)) {
    display.warn(
      `Review effort "${reviewer.effort}" is not in the known ${reviewer.mode} list ` +
        `(${knownEfforts(reviewer.mode).join(', ')}); passing it through to the CLI.`
    );
  }
  return true;
}

export interface ExpertReviewResult {
  output: string;
  costUsd?: number;
  durationMs?: number;
}

/**
 * Run a code review in an INDEPENDENT, READ-ONLY session.
 *
 * The reviewer must not be the agent that wrote the code — otherwise it
 * reviews its own work in the same context and rubber-stamps it. We therefore
 * always use `backend.execute()` (a fresh session) rather than `backend.resume()`,
 * on the reviewer's own backend/model/effort, with file edits disabled.
 *
 * Returns the review output plus usage metadata. The reviewer's session id is
 * intentionally discarded so it never contaminates the implementer session.
 */
export async function runExpertReview(opts: {
  backend: AIBackend;
  templateName: string;
  vars: Record<string, string>;
  model?: string;
  effort?: string;
  agents?: string[];
  skills?: string[];
  extraText?: string;
  log?: RunLogTarget;
  onEvent?: (event: Record<string, unknown>) => void;
}): Promise<ExpertReviewResult> {
  const prompt = assemblePrompt({
    templateName: opts.templateName,
    vars: opts.vars,
    agents: opts.agents,
    skills: opts.skills,
    extraText: opts.extraText,
    reviewer: opts.backend.name,
  });

  const result = await runPrompt(opts.backend, prompt, {
    log: opts.log,
    onEvent: opts.onEvent,
    model: opts.model,
    effort: opts.effort,
    readOnly: true,
  });
  return { output: result.output, costUsd: result.costUsd, durationMs: result.durationMs };
}
