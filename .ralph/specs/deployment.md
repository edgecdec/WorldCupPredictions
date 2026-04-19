# Deployment

## Architecture
- Server: see .ralph/.server-env for IP, nginx reverse proxy, pm2 process manager
- App runs on port 3006, NODE_ENV=production
- SSH: `source .ralph/.server-env && ssh -i $SSH_KEY $SSH_USER@$SSH_HOST`
- App dir: /var/www/WorldCupPredictions
- DB: /var/www/WorldCupPredictions/data/worldcup.db
- pm2 process name: worldcup
- Domain: worldcup.edgecdec.com

## Deploy Flow
1. Push to main → GitHub webhook fires
2. server.js receives POST /api/webhook, verifies HMAC signature
3. Runs deploy_webhook.sh via nohup
4. Script: flock → stop pm2 → git fetch/reset → conditional npm install → rm .next → build → verify chunks → restart pm2
5. Build failure = pm2 NOT restarted, old build keeps running

## Verification After Deploy
1. `source .ralph/.server-env`
2. `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:3006"` → 200
3. `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "ls /var/www/WorldCupPredictions/.next/static/chunks/*.js | wc -l"` → should be > 10
4. If chunks missing, build failed silently — rebuild manually on server:
   ```bash
   ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "cd /var/www/WorldCupPredictions && npm run build && NODE_ENV=production pm2 restart worldcup --update-env"
   ```

## Critical Rules
- NEVER restart pm2 without a successful build
- NEVER push code that doesn't build locally with `npx next build`
- A 200 from curl is NOT sufficient — chunks must exist
- Concurrent deploys cause race conditions — deploy script uses flock

## Useful Server Commands
```bash
source .ralph/.server-env

# Check all running apps
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 list"

# View logs
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 logs worldcup --lines 50 --nostream"

# Restart
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 restart worldcup"

# Check DB
ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "ls -la /var/www/WorldCupPredictions/data/"
```

## Maintenance Page
- nginx serves maintenance.html when pm2 is stopped (502 upstream)
- Auto-refreshes every 10 seconds

## Nova Act Verification
After deploying UI changes, verify with a Nova Act test script:
```bash
# Save test to /tmp/test_<feature>.py, run with:
/opt/homebrew/bin/python3.13 /tmp/test_<feature>.py
```
- Use `headless=True` and `ignore_https_errors=True` in NovaAct constructor
- Source `~/.config/worldcup.env` for any needed env vars (if created)
- Test against https://worldcup.edgecdec.com
- ONE NovaAct session per test, `max_steps=5` per act() call
- Delete the temp script after verification passes
