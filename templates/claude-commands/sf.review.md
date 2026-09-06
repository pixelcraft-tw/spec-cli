---
description: View review records
---

Parse $ARGUMENTS:
- First word not starting with @, /, or -- is <name>
- --step N: view specific task review
- --summary: all tasks summary
- --run: re-run the independent final review now (no re-implementation)
- --review-mode agent|codex, --review-model <model>, --review-effort <level>: override the reviewer for --run
- @ prefixed = agent, / prefixed = skill

Read `.workflow/state.yaml`.

- No options: show current pending review or most recent review
- --step N: read `.workflow/reviews/<name>-task-N.md` and display
- --summary: list all tasks' review status
- --run: perform the "Final Code Review" dispatch exactly as described in `/pxs.implement` — the review MUST come from the independent reviewer (`pxs-reviewer` subagent or `codex exec`), never from this session — save it to `.workflow/reviews/<name>-final.md`, then display it

{If @agent /skill present, they can provide supplementary analysis on existing reviews}
