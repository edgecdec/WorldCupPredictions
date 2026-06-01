# World Cup Predictions

## Overview

2026 FIFA World Cup bracket prediction app. Users predict group finishing orders, pick advancing 3rd-place teams, fill knockout brackets, and compete in scoring pools with friends.

Live at https://worldcup.edgecdec.com (port 3006, pm2 process `worldcup`).

## Stack

- **Frontend**: Next.js 15 (React 19, App Router), all pages `'use client'`
- **Styling**: MUI v7 + Emotion — use theme tokens only, never hardcoded hex
- **Database**: SQLite via better-sqlite3 (WAL mode, at `data/worldcup.db`)
- **Auth**: bcryptjs + JWT (httpOnly cookie named `token`)
- **Server**: Custom `server.js` wrapping Next.js + GitHub webhook handler
- **Hosting**: VPS, pm2, auto-deploys on push to `main` via webhook

## Commands

```bash
# Build & validate (run BOTH before committing)
npx tsc --noEmit
npx next build

# Run tests
npx vitest run

# Dev server (don't use in automated loops — it blocks)
npm run dev
```

## Project Structure

```
src/
├── app/              # Next.js App Router (pages + API routes)
│   ├── api/          # REST endpoints (auth, admin, picks, groups, leaderboard, scores, etc.)
│   ├── bracket/      # Group predictions, knockout bracket, public bracket views
│   ├── admin/        # Admin panel (tournament, results, group management)
│   ├── groups/       # Group creation/joining
│   ├── leaderboard/  # Scoring leaderboard with breakdowns
│   ├── simulate/     # What-if simulator (group + knockout) with Monte Carlo
│   ├── compare/      # Side-by-side prediction comparison
│   ├── whopicked/    # Pick distribution analysis
│   ├── stats/        # Stats dashboard
│   ├── profile/      # User profiles
│   └── join/         # Join-via-invite-link
├── components/
│   ├── bracket/      # GroupPrediction, KnockoutBracket, Matchup, MobileBracket, etc.
│   ├── common/       # Navbar, ThemeRegistry, CountdownTimer, ScoringEditor, etc.
│   ├── auth/         # AuthForm
│   └── admin/        # GroupResultsEditor, KnockoutResultsEditor, GroupManagement
├── hooks/            # useAuth, useThemeMode, useLiveScores, useMonteCarlo, useAutosave, etc.
├── lib/              # Core logic (db, auth, scoring, bracketEngine, knockoutBracket, espnSync, etc.)
└── types/            # index.ts (all shared interfaces)
```

## Key Patterns

- Data fetching in page components via `fetch('/api/...')`, components receive data as props
- `@/` path alias maps to `src/`
- `src/lib/db.ts` — singleton SQLite instance, auto-creates tables, WAL mode
- `src/lib/scoring.ts` — pure scoring functions, no DB dependency
- `src/lib/bracketEngine.ts` — generic bracket engine (any team count), feeder math is pure
- `src/lib/knockoutBracket.ts` — FIFA-specific R32 seeding using the generic engine
- Group membership is per-prediction (not per-user) via `group_members(group_id, prediction_id)`
- "Everyone" group (id='everyone') — all users auto-join, cannot leave

## Code Style

- No file > ~150 lines — extract into separate files
- No `any` type — define proper types in `src/types/index.ts`
- No hardcoded hex colors — use MUI theme tokens
- No magic numbers — use named UPPER_SNAKE_CASE constants
- No duplicate logic — search for existing utilities first
- No comments unless explaining WHY something non-obvious exists
- Naming: camelCase files for utils, PascalCase for components, UPPER_SNAKE for constants

## Deployment

- Push to `main` → webhook auto-deploys (git fetch, conditional npm install, next build, pm2 restart)
- Server connection: `source .ralph/.server-env` for SSH_KEY, SSH_USER, SSH_HOST
- Verify after deploy: `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:3006"` → 200
- View logs: `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 logs worldcup --lines 50 --nostream"`
- NEVER push code that doesn't pass `npx tsc --noEmit && npx next build`

## Testing

- `vitest` for unit tests (tests/ directory)
- Nova Act for browser verification against production (see .ralph/specs/anti-patterns.md for test pattern)
- Test creds in `.ralph/.test-creds` (gitignored)

## Known Issues

- 3 pre-existing test failures in `tests/scoring.test.ts` (knockout upset bonus and champion bonus tests) — not caused by recent changes, need investigation

## Task System

Legacy task backlog in `.ralph/prd.json` (103 tasks, all done). Progress log in `.ralph/progress.txt`. Spec documents in `.ralph/specs/`. For new work, use Claude Code's native task tracking or create new entries in prd.json.
