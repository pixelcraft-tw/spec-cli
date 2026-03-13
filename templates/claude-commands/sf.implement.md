---
description: Implement code task by task
---

Parse $ARGUMENTS:
- First word not starting with @, /, or -- is <name>
- --backend claude|codex
- --test [tdd] [intg]: test strategy
- @ prefixed = agent, / prefixed = skill
- Remaining = supplementary instructions

Read `.workflow/state.yaml` to confirm current status.
Read `.workflow/plans/<name>.md` to get task list.

## Pre-flight
If first run (phase = ready_to_implement):
1. Create new branch: `git checkout -b <type>/<name>` (branch name MUST be English)
2. Update state.yaml phase to implementing

## Execution Loop
For the next pending task:

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

### AI Review
1. Extract git diff for this task
2. Review against task spec
3. Label issues by severity (Critical / Warning / Info)
4. Save review to `.workflow/reviews/<name>-task-N.md`

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

#### Final Code Review
Before presenting merge options (skip if `--skip-review` was passed):
1. Get full branch diff: `git diff $(git merge-base <base-branch> HEAD)..HEAD` (base branch from state.yaml `base_branch` field, fallback to `main`)
2. Read spec and plan files
3. Perform **comprehensive code review** of all changes — read and analyze actual code, not just diff stats
4. If @agents or /skills were specified, involve them in the review
5. If no agents/skills specified, proactively use available review tools (e.g., /simplify, /code-review, code-reviewer agent)
6. Save review to `.workflow/reviews/<name>-final.md`
7. Present review findings to user with severity labels (Critical/Warning/Info) and verdict (PASS/NEEDS_CHANGES)

Options: [merge] [squash-merge] [keep-branch]

{@agent instructions}
{/skill instructions}
{Supplementary instructions}
