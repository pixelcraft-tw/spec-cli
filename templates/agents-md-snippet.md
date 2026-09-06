## SF Spec-Driven Workflow

This project uses sf for spec-driven development.

### Workflow State
- Read `.workflow/state.yaml` for current progress
- Read `.workflow/plans/<feature>.md` for implementation plan

### Rules
- Implement tasks in the order specified in the plan; do not skip
- After completing each task, run `git add -A && git commit`
- Commit messages follow conventional commits or the project's custom convention
- Do not implement beyond task spec scope
- After each task completion, wait for user confirmation before continuing
- Code reviews are produced by an independent reviewer (`review.mode` in `.workflow/config.yaml`: `agent` = isolated Claude Code reviewer, `codex` = OpenAI Codex CLI), never by the session that wrote the code

### Prompt Templates
- Implementation guide: `.workflow/prompts/implement.md`
- TDD guide: `.workflow/prompts/implement-tdd.md`
- Review guide: `.workflow/prompts/review.md` (task) and `.workflow/prompts/final-review.md` (branch)
- Reviewer agent: `.claude/agents/pxs-reviewer.md`
- Test guide: `.workflow/prompts/test.md`
