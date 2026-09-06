---
description: Create a new spec file
---

Create a spec based on user input.

Parse $ARGUMENTS:
- First word is the feature name <name> (MUST be English, kebab-case. If user provides Chinese, translate to English)
- If `--jira <tickets...>` present, read each ticket's content via Jira MCP (supports multiple, space-separated)
- If text contains Jira URLs (e.g., `https://xxx.atlassian.net/browse/PROJ-123`), extract ticket IDs and treat as `--jira`
- If `--desc` present, following text is the description
- If `-i` present, enter interactive Q&A
- `--review-mode agent|codex`, `--review-model <model>`, `--review-effort <level>`: pre-select the independent reviewer (skips the question in step 4)
- Remaining text is treated as feature description

Steps:
1. Check if `.workflow/specs/<name>.md` already exists; if so, ask to confirm overwrite
2. Generate spec based on input method:
   - No extra args: copy `.workflow/templates/spec-template.md` to `.workflow/specs/<name>.md`
   - Has description text: expand into complete spec
   - Has --jira or Jira URLs: read Jira content via MCP and convert to spec
   - Has -i: ask questions step by step to generate spec
3. Display generated spec content
4. Choose the independent reviewer for this feature (the session that implements never reviews its own work):
   - Skip the question if `--review-*` flags were given, or if `which codex` (Bash) finds no Codex CLI — without Codex, `agent` is the only option and `.workflow/config.yaml` `review:` applies
   - Otherwise ask with AskUserQuestion, one question at a time, always as lists so nothing has to be typed from memory:
     1. **Reviewer mode**: `agent` — isolated Claude Code reviewer (Recommended) | `codex` — OpenAI Codex CLI, cross-vendor second opinion
     2. **Reviewer model**: `(default: …)` first — spell out what the default really is: the value in `.workflow/config.yaml` if set, otherwise for `codex` the `model` in `~/.codex/config.toml`, for `agent` "claude CLI default" — then:
        - `agent`: `fable`, `opus`, `sonnet` (`haiku` or a full model id via Other)
        - `codex`: the models the local CLI lists — read `~/.codex/models_cache.json` (or `$CODEX_HOME/models_cache.json`), take `models[]` with `visibility == "list"` ordered by `priority`, show the first three `slug`s (more via Other); if the file is unreadable use `gpt-5.5`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`
     3. **Reviewer effort**: `(default: …)` first — again spelled out: config.yaml if set, otherwise for `codex` the `model_reasoning_effort` in `~/.codex/config.toml`, for `agent` "claude CLI default" — then the levels for the picked model — `agent`: `low`, `medium`, `high` (`xhigh`/`max` via Other); `codex`: that model's `supported_reasoning_levels[].effort` from the cache (fallback `low`, `medium`, `high`, `xhigh`)
   - Record the answer (omit `(default)` picks) under the feature in `.workflow/state.yaml`, together with `phase: spec_created`:
     ```yaml
     review:
       mode: codex
       model: gpt-5.5
       effort: high
     ```
   - Then tell the user the resolved reviewer in one line, filling unset values from the same defaults, e.g. `Reviewer: codex · gpt-5.6-sol (codex default) · effort ultra`
   - Note: pxs drives the `codex` CLI directly (`codex exec -m <model> -c model_reasoning_effort=<effort> -s read-only`), not the `/codex:review` plugin command — that command accepts `--model` but has no effort setting
5. Prompt user they can manually edit then run `/pxs.refine <name>`
