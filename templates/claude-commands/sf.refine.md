---
description: Refine spec and decompose implementation plan
---

Parse $ARGUMENTS:
- First word not starting with @ or / is <name>
- @ prefixed words are agent references
- / prefixed words are skill/MCP references
- --skip-clarify skips requirement clarification
- Remaining text is supplementary instructions

<HARD-GATE>
- This command is STRICTLY for spec refinement and plan decomposition
- DO NOT write, create, modify, or delete any source code files
- DO NOT implement any functionality — no application code, no tests, no config changes
- The ONLY files you may write to:
  - `.workflow/specs/<name>.md` (refined spec)
  - `.workflow/plans/<name>.md` (decomposed plan)
  - `.workflow/state.yaml` (state updates)
- Implementation belongs to `/pxs.implement` — not here
</HARD-GATE>

Read `.workflow/specs/<name>.md`.

## Phase 1: Requirement Clarification
Unless --skip-clarify is present:
1. Analyze spec, identify ambiguous or incomplete requirements
2. Present as numbered questions with suggested options
3. Wait for user answers
4. Follow up if needed (max 3 rounds)
5. If spec is sufficiently clear, inform user and proceed to next phase

{If @agent present, involve corresponding agent in requirement analysis}
{If /skill present, use corresponding MCP/skill to assist analysis}

## Phase 2: Refine Spec
1. First scan codebase to understand existing architecture, modules, design patterns, infrastructure
2. Refine spec based on confirmed requirements and codebase analysis
3. Prioritize reusing existing modules; design for minimal change
4. Add technical details, architecture decisions (with rationale and alternatives), API design, file paths, acceptance criteria
5. Each architecture suggestion includes justification (why needed, existing alternatives, cost of introduction)
6. Overwrite `.workflow/specs/<name>.md`
7. Present refined spec to user for confirmation
8. User approves to continue; otherwise modify based on feedback

Remember: Do NOT write any implementation code. Only update the spec document.

## Phase 3: Decompose Plan
1. Determine feature type (feat/fix/refactor/docs/chore)
2. Decompose requirements into independently completable tasks
3. Each task lists: title, affected files, description, dependencies, complexity, acceptance criteria
4. Generate `.workflow/plans/<name>.md`
5. Present plan to user:
   - Type and branch naming
   - Each task's content
6. User approve → update `.workflow/state.yaml`
7. User edit → wait for modifications
8. User re-split → re-decompose based on feedback

Remember: Do NOT write any implementation code. Only generate the plan document.

{Supplementary instructions: $REMAINING_TEXT}
