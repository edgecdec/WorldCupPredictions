# Implement Task

You are implementing a single task for the World Cup Predictions app. Follow this workflow:

## Input
The user will describe what to implement (or reference a task ID from `.ralph/prd.json`).

## Workflow

1. **Read context** — Read `.ralph/specs/anti-patterns.md` for mistakes to avoid. Read the relevant spec file if one applies. Read any source files you'll be modifying.

2. **Plan** — Briefly state what files you'll create/modify and the approach. Keep it to 2-3 sentences.

3. **Implement** — Make the changes. Follow all patterns from CLAUDE.md (theme tokens, no any, no magic numbers, <150 line files, etc.).

4. **Validate** — Run `npx tsc --noEmit` and `npx next build`. Both must pass. If they fail, fix and re-run (max 3 attempts).

5. **Test** — If you added logic, check if existing tests cover it or add minimal tests. Run `npx vitest run`.

6. **Commit** — Stage and commit with message format: `feat: short description` or `fix: short description`.

7. **Deploy** — Push to main. Wait 30 seconds, then verify deployment via SSH health check.

## Constraints
- ONE focused change per invocation
- Search for existing utilities before writing new ones
- Don't modify unrelated code
- If stuck after 3 validation attempts, report what's broken and stop
