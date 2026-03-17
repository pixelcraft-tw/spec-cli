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
- Remaining text is treated as feature description

Steps:
1. Check if `.workflow/specs/<name>.md` already exists; if so, ask to confirm overwrite
2. Generate spec based on input method:
   - No extra args: copy `.workflow/templates/spec-template.md` to `.workflow/specs/<name>.md`
   - Has description text: expand into complete spec
   - Has --jira or Jira URLs: read Jira content via MCP and convert to spec
   - Has -i: ask questions step by step to generate spec
3. Display generated spec content
4. Prompt user they can manually edit then run `/pxs.refine <name>`
