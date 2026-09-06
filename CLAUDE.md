# specflow (pxs)

Spec-driven development CLI tool.

## Build & Test

```bash
npm run build    # tsc
npm run dev      # tsx watch bin/pxs.ts
npm test         # vitest
```

## Architecture

- `bin/pxs.ts` — CLI entry point
- `src/cli.ts` — Commander.js program setup
- `src/commands/` — One file per command (init, new, refine, clarify, implement, review, status, reset, diff)
- `src/backends/` — AI backend abstraction (claude, codex) via subprocess
- `src/state/` — YAML-based workflow state management
- `src/parsers/` — Argument, spec, and plan parsing
- `src/discovery/` — Project detection and model choice lists
- `src/git/` — Git operations wrapper
- `src/utils/` — Prompt template loading, display formatting, independent reviewer resolution (`review.ts`)
- `templates/` — Files copied to target project by `pxs init` (workflow prompts, `claude-commands/`, `claude-agents/`)

## Conventions

- Package: `@pixelcraft-tw/spec`, binary: `pxs`
- Slash commands use `pxs.*` naming (e.g., `/pxs.refine`)
- Zero API dependency — only spawns CLI subprocesses (claude, codex)
- State stored in `.workflow/state.yaml` (YAML)
- Prompt templates in `.workflow/prompts/`
- Reviews always go through `runExpertReview` on the reviewer's own backend (`review.mode`: `agent` | `codex`), in a fresh read-only session (claude: editor tools disallowed + no MCP; codex: `-s read-only`) — never the implementer session
- Codex is spawned as `codex exec --json -` with the prompt on stdin; its JSONL parser (`parseCodexJson`) and the claude one (`parseStreamJson`) are golden-tested
