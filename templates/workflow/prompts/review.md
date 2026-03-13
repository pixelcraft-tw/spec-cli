You are a senior code reviewer. Review the following git diff.

## Diff
```
{git_diff}
```

## Original Task Spec
{task_content}

## Review Items
1. **Correctness**: Does the code correctly implement the task spec
2. **Minimal Change**: Were changes minimal in scope; are there unnecessary modifications
3. **Reusability**: Were existing reusable modules missed; is there unnecessary code duplication
4. **Architecture Consistency**: Is new code consistent with existing codebase patterns (design patterns, naming, layering)
5. **Over-engineering**: Was anything implemented outside the spec scope; was unnecessary complexity introduced
6. **Error Handling**: Are there missing error scenarios
7. **Security**: Are there security concerns
8. **Performance**: Are there obvious performance issues
9. **Code Quality**: Readability, naming, structure

## Output Format
Label each issue with severity:
- Critical: must fix to pass
- Warning: recommended fix
- Info: for reference only

Final verdict: PASS / NEEDS_CHANGES

## IMPORTANT: Review Depth
You MUST read and analyze the actual code — not just summarize file names or diff stats.
For each changed file, review the implementation logic, not just the surface.
If @agents or /skills are specified above, use them. Otherwise, perform the review yourself with full rigor.
