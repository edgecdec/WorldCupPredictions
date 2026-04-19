# Project: World Cup Predictions

## Stack

- **Frontend**: Next.js 15 (React 19) with App Router
- **Styling**: MUI v7 + Emotion
- **Database**: SQLite via better-sqlite3
- **Auth**: bcryptjs + JWT (jsonwebtoken)
- **Server**: Custom `server.js` wrapping Next.js (same pattern as March Madness)
- **Hosting**: Self-hosted on VPS, managed by pm2, auto-deploys via GitHub webhook

## Project Structure

```
/
├── .ralph/              # Ralph loop config
├── data/                # SQLite database (gitignored)
├── server.js            # Custom Node HTTP server (Next.js + webhook)
├── deploy_webhook.sh    # Auto-deploy via GitHub webhook
├── maintenance.html     # Shown during deploys
├── src/
│   ├── app/             # Next.js App Router pages + API routes
│   │   ├── api/auth/    # Register/login
│   │   ├── api/admin/   # Tournament management
│   │   ├── api/picks/   # Save/load predictions
│   │   ├── api/groups/  # Group CRUD
│   │   ├── api/leaderboard/
│   │   ├── api/tournaments/
│   │   ├── api/scores/
│   │   ├── api/stats/
│   │   ├── admin/       # Admin panel
│   │   ├── bracket/     # Group stage + knockout predictions
│   │   ├── groups/      # Group management
│   │   ├── leaderboard/ # Leaderboard
│   │   ├── compare/     # Compare predictions
│   │   ├── whopicked/   # Who picked whom
│   │   ├── simulate/    # What-if simulator
│   │   ├── stats/       # Stats dashboard
│   │   ├── layout.tsx   # Root layout
│   │   ├── globals.css
│   │   └── page.tsx     # Home/landing
│   ├── components/
│   │   ├── auth/        # AuthForm
│   │   ├── bracket/     # GroupPrediction, KnockoutBracket, Matchup, MobileBracket, MediumBracket
│   │   └── common/      # Navbar, ThemeRegistry, CountdownTimer, ScoringEditor, ScoringBreakdownDialog, GroupChat
│   ├── hooks/           # useAuth, useThemeMode, useLiveScores, useMonteCarlo
│   ├── lib/             # db, auth, scoring, bracketData, knockoutBracket, espnSync, monteCarloWorker
│   └── types/           # index.ts (all shared types)
└── public/              # Static assets (flags, logos)
```

## Key Patterns

- All pages are `'use client'` — data fetching via API routes.
- `src/lib/db.ts` initializes SQLite with better-sqlite3, auto-creates tables on first access.
- `src/lib/auth.ts` handles JWT sign/verify and password hashing.
- `src/lib/scoring.ts` contains all scoring logic as pure functions.
- Components accept props; data fetching happens in page components.
- MUI theme tokens only — no hardcoded hex colors in components.
- `@/` path alias maps to `src/`.

## Backpressure Validation Commands

Run in order. ALL must exit 0 before committing.

```bash
npx tsc --noEmit
npx next build
```

## Remote Server Access

Connection details are stored locally in `.ralph/.server-env` (gitignored). Read that file to get `SSH_KEY`, `SSH_USER`, and `SSH_HOST`.

- Production path: `/var/www/WorldCupPredictions`
- Live URL: https://worldcup.edgecdec.com
- OS: Ubuntu 24.04, x86_64
- Process manager: pm2
- Other apps on same server: jeopardy (:3000), superconnections (:3001), marchmadness (:3002), discord-alt (:3003), fantasy-football (:3004), minecraft-feud (:3005)
- This app runs on port 3006.

### Useful Remote Commands
```bash
source .ralph/.server-env

# Check running processes
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 list"

# View app logs
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 logs worldcup --lines 50"

# Restart app
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 restart worldcup"

# Test if app is responding
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:3006"
```

## Deployment

- Auto-deploys on push to `main` via GitHub webhook.
- `server.js` handles the webhook POST at `/api/webhook`, verifies signature, runs `deploy_webhook.sh`.
- `deploy_webhook.sh`: git fetch/reset, conditional npm install, next build, pm2 restart.
- After pushing, verify deployment: `source .ralph/.server-env && ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:3006"` — must return 200.
