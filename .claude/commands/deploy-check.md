# Deploy Check

Verify the production deployment is healthy.

1. Source `.ralph/.server-env` to get SSH credentials
2. Check the app is responding: `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:3006"` — must return 200
3. Check pm2 status: `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 list"`
4. Check recent logs for errors: `ssh -i $SSH_KEY $SSH_USER@$SSH_HOST "pm2 logs worldcup --lines 20 --nostream"`
5. Report: status code, uptime, any recent errors
