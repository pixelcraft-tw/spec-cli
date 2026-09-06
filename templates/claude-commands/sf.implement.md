---
description: Implement code task by task
---

Parse $ARGUMENTS:
- First word not starting with @, /, or -- is <name>
- --backend claude|codex
- --test [tdd] [intg]: test strategy
- --review-mode agent|codex, --review-model <model>, --review-effort <level>: override the independent reviewer for this run
- @ prefixed = agent, / prefixed = skill
- Remaining = supplementary instructions

Read `.workflow/state.yaml` to confirm current status.
Read `.workflow/plans/<name>.md` to get task list.

## Independent Reviewer (applies to every review below)

<HARD-GATE>
You are the implementer. You MUST NOT review your own work in this session — every task review and the final review is produced by an isolated reviewer that receives only a rendered prompt. Never summarize, soften, or re-grade its output.
</HARD-GATE>

Resolve the reviewer once — precedence: `--review-*` flags > the feature's `review:` block in `.workflow/state.yaml` > `review:` in `.workflow/config.yaml` (default mode `agent`).

Before the first task and again before each review, print one line saying exactly which reviewer will run, filling unset values from the CLI's own defaults (`codex`: `model` / `model_reasoning_effort` in `~/.codex/config.toml`; `agent`: "claude default"), e.g. `Reviewer: codex · gpt-5.6-sol (codex default) · effort xhigh (codex default)`.

Dispatch a rendered review prompt like this:
- **mode `agent`**: call the Agent tool with `subagent_type: "pxs-reviewer"` and `prompt` = the rendered prompt only (no conversation history, no summary of what you did). Pass `model` when a reviewer model is resolved. (Effort for this subagent is set in `.claude/agents/pxs-reviewer.md` frontmatter.)
- **mode `codex`**: write the rendered prompt to `.workflow/logs/<prompt-file>.md`, then run via Bash:
  ```bash
  codex exec -s read-only --ephemeral --skip-git-repo-check \
    [-m <model>] [-c model_reasoning_effort=<effort>] \
    -o <review-file> - < .workflow/logs/<prompt-file>.md
  ```
  If `codex` is not installed, stop and tell the user — do not fall back to reviewing it yourself.

Rendering a prompt = take the template from `.workflow/prompts/`, replace each `{placeholder}`, and append `.workflow/architecture.md` under `## Architecture Constraint` if it exists, plus any `@agent` / `/skill` instructions from $ARGUMENTS.

## Pre-flight
If first run (phase = ready_to_implement):
1. Create new branch: `git checkout -b <type>/<name>` (branch name MUST be English)
2. Update state.yaml phase to implementing

## Execution Loop
For the next pending task:

0. Record the task anchor: `git rev-parse HEAD`. Everything the task commits is `<anchor>..HEAD` — that range is what the reviewer receives
1. Read the task spec
2. First scan codebase to understand relevant existing modules, design patterns, utility functions
3. Prioritize reusing existing code; implement with minimal changes (don't over-engineer)
4. Follow git commit convention (refer to CLAUDE.md; default is conventional commits)
5. On completion: `git add -A && git commit -m "<type>(<name>): task-N <title>"` (commit message MUST be English, no Co-Authored-By trailer)

### Testing (based on --test parameter)
- `--test tdd`: TDD mode
  - Write failing tests first → confirm FAIL
  - Write minimum code → confirm PASS
  - Refactor → confirm still PASS
  - `git add -A && git commit -m "test(<name>): task-N <title>"`
- `--test tdd intg`: TDD + integration tests
  - Same as above, but tests include integration tests
- `--test intg`: Post-hoc integration tests
  - Generate integration tests after implementation
  - `git add -A && git commit -m "test(<name>): task-N <title>"`
- `--test` (no value): Post-hoc unit tests
  - Generate unit tests after implementation
  - `git add -A && git commit -m "test(<name>): task-N <title>"`
- No --test: don't generate tests

### AI Review (independent — never in this session)
1. Render `.workflow/prompts/review.md`: `{git_diff}` = `git diff <anchor>..HEAD`, `{task_content}` = the task spec, `{docs_content}` = any `--docs` files (or `(none provided)`)
2. Dispatch it to the independent reviewer (see above) with prompt file `<name>-task-N-review-prompt` and review file `.workflow/reviews/<name>-task-N.md`
3. Save the reviewer's output verbatim to `.workflow/reviews/<name>-task-N.md` (the codex command already writes it)

### Present to User
- Changed file list
- AI review summary
- Condensed diff
- Options: [approve] [request-change] [add-test] [skip]

### Handle User Choice
- approve: update state.yaml, task status = complete
- request-change: read feedback, reset commits, re-implement
- add-test: generate tests, commit, re-review
- skip: update state.yaml, task status = skipped

### All Tasks Complete
Present task summary.

#### Final Code Review (independent — never in this session)
Before presenting merge options (skip if `--skip-review` was passed):
1. Get full branch diff: `git diff $(git merge-base <base-branch> HEAD)..HEAD` (base branch from state.yaml `base_branch` field, fallback to `main`)
2. Render `.workflow/prompts/final-review.md`: `{branch_diff}`, `{spec_content}` = `.workflow/specs/<name>.md`, `{plan_content}` = `.workflow/plans/<name>.md`, `{docs_content}` = any `--docs` files
3. Dispatch it to the independent reviewer (see above) with prompt file `<name>-final-review-prompt` and review file `.workflow/reviews/<name>-final.md`
4. Save the output verbatim to `.workflow/reviews/<name>-final.md`
5. Present the review to the user with severity labels (Critical/Warning/Info) and verdict (PASS/NEEDS_CHANGES)

Options: [merge] [squash-merge] [keep-branch]

{@agent instructions}
{/skill instructions}
{Supplementary instructions}
