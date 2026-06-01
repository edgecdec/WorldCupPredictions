# Validate

Run the full validation suite that must pass before any commit:

1. `npx tsc --noEmit` — type checking
2. `npx next build` — full production build
3. `npx vitest run` — unit tests (note: 3 pre-existing failures in scoring.test.ts are known)

Report each step's result. If any step fails (besides the known test failures), show the error output and suggest a fix.
