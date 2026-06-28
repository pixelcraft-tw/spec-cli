import fs from 'node:fs';
import type { AIBackend } from '../backends/interface.js';
import { assemblePrompt } from './prompt.js';

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

/**
 * Run a code review in an INDEPENDENT session.
 *
 * The reviewer must not be the same agent that wrote the code — otherwise it
 * reviews its own work in the same context and rubber-stamps it. We therefore
 * always use `backend.execute()` (a fresh session) rather than `backend.resume()`.
 * The assembled prompt instructs the reviewer to invoke the `/code-review`
 * skill / `code-reviewer` agent for depth.
 *
 * Returns the review output. The reviewer's session id is intentionally
 * discarded so it never contaminates the implementer session.
 */
export async function runExpertReview(opts: {
  backend: AIBackend;
  templateName: string;
  vars: Record<string, string>;
  agents?: string[];
  skills?: string[];
  extraText?: string;
}): Promise<string> {
  const prompt = assemblePrompt({
    templateName: opts.templateName,
    vars: opts.vars,
    agents: opts.agents,
    skills: opts.skills,
    extraText: opts.extraText,
  });

  const result = await opts.backend.execute(prompt);
  return result.output;
}
