# Plan New Feature

Generate an implementation plan as new tasks. You do NOT write source code in this mode.

## Workflow

1. Read `.ralph/AGENTS.md` for project context and stack.
2. Read ALL spec files in `.ralph/specs/` to understand existing requirements.
3. Analyze the current codebase to identify what exists (gap analysis).
4. Based on the user's feature request, generate a dependency-ordered task list.

## Task Format

Add new tasks to `.ralph/prd.json` with IDs continuing from the last used (currently TASK-103). Each task:

```json
{
  "id": "TASK-104",
  "title": "Short description",
  "spec": "specs/filename.md",
  "priority": N,
  "status": "open",
  "dependencies": ["TASK-XXX"],
  "description": "One paragraph of what to implement."
}
```

## Rules
- Tasks must be atomic — completable in a single focused iteration
- If a task requires "and" to describe, split it
- Order by dependency (blockers first) then by priority
- Reference existing spec files or note if a new spec is needed
- Do NOT write any source code
