# Anti-Patterns — Read This First Every Loop

## Iteration Discipline
- STRICTLY ONE task per iteration. NEVER combine multiple changes into one commit.
- If you notice another issue while working, log it in .ralph/progress.txt and move on.
- Each commit = exactly ONE logical change.
- If a task is bigger than expected, implement what you can, set it to "done", and note remaining work in progress.txt.

## Concurrent Editing
- ALWAYS re-read a file before modifying it — never assume it hasn't changed.
- Before editing prd.json or progress.txt, read the current version first.

## Context Management
- Do NOT read every file in the project — only read files relevant to the current task.
- Read the relevant spec file ONCE, then work from memory.
- Minimize context window usage — you degrade when the window fills up.

## Build & Validation
- NEVER commit code that doesn't pass ALL backpressure commands (tsc --noEmit, next build).
- After changing imports or moving files, verify build passes — macOS is case-insensitive but the Linux server is case-sensitive.
- If you rename or move a file, grep the codebase for old import paths and update them all.

## Code Quality
- NEVER use `any` type — define proper types in src/types/.
- FULL implementations only. No placeholders. No stubs. No TODOs.
- Search the codebase before implementing — don't assume something doesn't exist.
- NEVER put magic numbers or hardcoded strings inline — use named constants.
- NEVER duplicate logic — search for existing utilities first.

## MUI / Theming
- NEVER use hardcoded hex colors in components.
- ALWAYS use MUI theme tokens: `text.primary`, `text.secondary`, `background.default`, `background.paper`, `divider`, `primary.main`, `action.hover`.
- For colors that differ between modes, use `theme.palette.mode === 'dark' ? darkValue : lightValue`.

## React Patterns
- Props that seed useState only run once — use useEffect to sync if prop changes.
- NEVER create new object/array references inside useEffect dependencies — use useMemo/useCallback.
- NEVER call setState inside useEffect without proper dependency guards.

## Deployment
- NEVER modify deploy_webhook.sh or server.js webhook handler unless the task specifically requires it.
- NEVER run `node server.js` locally — it blocks the iteration.
- After every `git push`, wait 60 seconds then verify deployment returns 200.
- If deploy fails, check logs: `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 logs worldcup --lines 30 --nostream"`
- Do NOT proceed to the next task if the site is down after your push.

## Security
- NEVER hardcode IP addresses, API keys, secrets, tokens, or passwords in any committed file.
- ALL secrets go in `.env` (gitignored). Reference them via `process.env.VARIABLE_NAME`.
- Server connection details live in `.ralph/.server-env` (gitignored).
- NEVER commit `.env` files.

## File Handling
- ALWAYS read prd.json before editing it — parse the JSON, modify the specific task, write it back.
- When appending to progress.txt, APPEND only — do not rewrite existing content.
- Do NOT modify spec files unless explicitly told to by the human.

## Git Hygiene
- NEVER use `git push --force` EXCEPT for the final status update amend after deploy verification.
- The ONLY allowed amend is: deploy verified → update prd.json/progress.txt → `git commit --amend --no-edit && git push --force-with-lease`.

## Nova Act Testing
After deploying any UI task, write a temporary Nova Act test script to verify against https://worldcup.edgecdec.com.
- Save as `/tmp/test_<feature>.py`, run with `/opt/homebrew/bin/python3.13 /tmp/test_<feature>.py`
- Use `headless=True`, ONE NovaAct session, `max_steps=5` per act() call
- Delete the temp script after verification passes
