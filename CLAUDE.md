# Project Notes

## Deploy Configuration (configured by /setup-deploy)
- Platform: custom Linux host with Nginx, PostgreSQL, and systemd
- Production URL: https://exam.acgbot.cc.cd
- Deploy workflow: manual host deploy from the `main` branch
- Deploy status command: HTTP health check
- Merge method: squash
- Project type: web app with Fastify API and Vite frontend
- Post-deploy health check: https://exam.acgbot.cc.cd/api/health

### Custom deploy hooks
- Pre-merge: npm run test --workspaces && npm run typecheck --workspaces && npm run build --workspaces
- Deploy trigger: pull latest `main` on the host, run `npm install`, `npm run build --workspaces`, `npm run db:migrate -w @bkyexam-practice/api`, then restart the API systemd service and reload Nginx if configuration changed
- Deploy status: poll https://exam.acgbot.cc.cd/api/health
- Health check: https://exam.acgbot.cc.cd/api/health
