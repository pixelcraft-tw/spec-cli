---
description: Run requirement clarification on a spec
---

Parse $ARGUMENTS:
- First word not starting with @ or / is <name>
- @ prefixed = agent, / prefixed = skill
- Remaining = supplementary instructions

<HARD-GATE>
- This command is STRICTLY for requirement clarification
- DO NOT write, create, modify, or delete any source code files
- DO NOT implement any functionality — no application code, no tests, no config changes
- The ONLY files you may write to:
  - `.workflow/specs/<name>.md` (updated spec with clarified requirements)
  - `.workflow/state.yaml` (state updates)
- Implementation belongs to `/pxs.implement` — not here
</HARD-GATE>

Read `.workflow/specs/<name>.md`.

Analyze spec, identify requirements that can be further clarified.
Present as numbered questions, wait for user answers.
Update spec based on answers.

Remember: Do NOT write any implementation code. Only update the spec document.

{If @agent present, involve corresponding agent}
{If /skill present, use corresponding MCP/skill to assist}
{Supplementary instructions}
