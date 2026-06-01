# Ralph Loop (Autonomous Mode)

You are operating in autonomous task execution mode. Execute the NEXT open task from the backlog, then stop.

## Workflow

1. Read `.ralph/prd.json` — find the highest-priority task with `"status": "open"` (or `"in_progress"` from a prior failed attempt). If no open tasks remain, report "ALL TASKS COMPLETE" and stop.

2. Read `.ralph/specs/anti-patterns.md` — critical mistakes to avoid.

3. Read the spec file referenced by the task's `"spec"` field.

4. Set the task status to `"in_progress"` in prd.json.

5. Read relevant source files before editing — another agent may have changed them.

6. Implement ONLY that single task. Do not touch unrelated code.

7. Run validation: `npx tsc --noEmit` and `npx next build`. Fix failures (max 3 retries).

8. If validation passes: commit with message `TASK-XXX: short description`, then push.

9. Verify deployment: source `.ralph/.server-env`, poll `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:3006"` until 200 (max 120s).

10. Update task status to `"done"` in prd.json. Append lessons to `.ralph/progress.txt`.

11. Amend the commit to include the status update: `git add -A && git commit --amend --no-edit && git push --force-with-lease`.

12. Stop. One task per invocation.

## If Stuck
- Max 3 retry attempts on validation failures
- If still failing: set status to `"blocked"`, log reason in progress.txt, stop
- Never skip validation to unblock yourself
