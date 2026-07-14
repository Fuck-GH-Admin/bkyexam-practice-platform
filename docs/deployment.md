# Deployment

The primary deployment target is `https://exam.acgbot.cc.cd`, served from a small Linux host running Nginx, PostgreSQL, and systemd-managed Node processes. Cloudflare proxies the DNS record, so the host only needs to serve the app correctly behind HTTPS.

## Target Shape

```text
Nginx
  |-- serves apps/web/dist
  `-- proxies /api/* to Fastify on localhost

systemd
  `-- starts apps/api/dist/index.js

PostgreSQL
  `-- stores imported question bank and student practice data
```

Production liveness check: `https://exam.acgbot.cc.cd/api/health`.

Production readiness check: `https://exam.acgbot.cc.cd/api/health/readiness`.

The expected early production size is fewer than 100 users on a 2 core, 2 GB server.

## Native Process First

Native process deployment is preferred first:

1. Install Node matching `package.json` engines, PostgreSQL, and Nginx on Linux.
2. Run `npm ci` from the project root.
3. Run `npm run build --workspaces`.
4. Configure API runtime environment variables, especially `DATABASE_URL`, `USE_DATABASE=true`, `COOKIE_SECRET`, and `COOKIE_SECURE=true` when behind HTTPS.
5. Run database migrations with `npm run db:migrate -w @bkyexam-practice/api`.
6. Import or refresh the question-bank corpus if needed, then run `npm run db:smoke -w @bkyexam-practice/api`.
7. Run the API with `node apps/api/dist/index.js` under systemd.
8. Serve `apps/web/dist` through Nginx for `exam.acgbot.cc.cd`.
9. Reverse proxy `/api/` to the local Fastify port.

Minimal Nginx shape:

```nginx
server {
    server_name exam.acgbot.cc.cd;

    root /srv/bkyexam-practice-platform/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Docker is optional. It may become useful when deployment scripts, database migrations, and import jobs need stricter packaging. It is not required for the first Linux deployment.

## Local PostgreSQL

For local development only, start the Docker PostgreSQL service from `PracticePlatform`:

```sh
docker compose up -d postgres
```

Set the API database connection string:

```sh
DATABASE_URL=postgres://bkyexam:bkyexam@127.0.0.1:5432/bkyexam_practice
```

On PowerShell, set it for the current shell session with:

```powershell
$env:DATABASE_URL="postgres://bkyexam:bkyexam@127.0.0.1:5432/bkyexam_practice"
```

On cmd.exe, set it for the current shell session with:

```bat
set DATABASE_URL=postgres://bkyexam:bkyexam@127.0.0.1:5432/bkyexam_practice
```

The `.env.example` file is a template for local configuration and is not auto-loaded by the app.

Run migrations after PostgreSQL is healthy:

```sh
npm run db:migrate -w @bkyexam-practice/api
```

Migrations run all files in `apps/api/src/db/migrations` in filename order. The current runtime requires:

- `0001_initial.sql`
- `0002_practice_sessions.sql`
- `0003_practice_drafts.sql`

Then import the source question bank and run a smoke check:

```powershell
npm run import:db -w @bkyexam-practice/api -- C:\path\to\BKYExam\Monitor\questionbank
npm run db:smoke -w @bkyexam-practice/api
```

Observed real PostgreSQL result after the full corpus import on 2026-07-10:

```json
{
  "classifications": 2941,
  "questions": 89922,
  "options": 154899,
  "skippedOptions": 25424,
  "bankMappings": 2662
}
```

`skippedOptions` are source option rows whose `questionId` does not exist in the exported question files, so they cannot satisfy the database foreign key.

This Docker PostgreSQL service is intended for local development only. Production can use native PostgreSQL.

## Runtime Configuration

The API currently reads configuration from environment variables through `apps/api/src/config.ts`:

- `NODE_ENV`: defaults to `development`.
- `PORT`: defaults to `3000`.
- `DATABASE_URL`: defaults to `postgres://postgres:postgres@127.0.0.1:5432/bkyexam_practice`.
- `USE_DATABASE`: accepts `true` or `false` and defaults to `false`.
- `COOKIE_SECRET`: signs cookie data and defaults to `dev-cookie-secret-change-me` for local development. Set a long random value in production.
- `COOKIE_SECURE`: accepts `true` to require HTTPS-only cookies. Defaults to `false`; set to `true` behind production HTTPS.
- `SESSION_TTL_DAYS`: positive integer session lifetime in days, default `30`.
- `STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED`: explicit migration/development escape hatch for old no-password accounts, default `false`; keep `false` in public production.
- `STUDENT_LOGIN_MAX_FAILURES`: relaxed student login failure threshold, default `10`.
- `STUDENT_LOGIN_FAILURE_WINDOW_MINUTES`: student login failure counting window, default `30`.
- `STUDENT_LOGIN_LOCK_MINUTES`: temporary lock duration after threshold, default `15`.
- `ADMIN_SESSION_TTL_HOURS`: positive integer admin session lifetime in hours, default `8`.
- `ADMIN_IMPORT_ALLOWED_ROOTS`: semicolon-separated allowlist of directories from which Admin Import Jobs may read source question-bank files.
- `ADMIN_IMPORT_ENABLE_WRITE`: set to `true` to enable `/api/admin/import-jobs` `mode=import` writes; default `false`. Even when enabled, `resetBeforeImport=true` remains blocked.
- `RATE_LIMIT_ENABLED`: set to `true` to enable the in-memory minimum API rate limiter; default `false`.
- `RATE_LIMIT_WINDOW_MS`: positive integer rate-limit window in milliseconds, default `60000`.
- `RATE_LIMIT_MAX`: positive integer request count per client/method/route/window, default `600`.
- `CSRF_ORIGIN_CHECK_ENABLED`: set to `true` to reject unsafe Cookie requests from origins outside the allowlist; default `false`.
- `CSRF_ALLOWED_ORIGINS`: semicolon-separated allowed browser origins for CSRF origin checks; defaults to local Vite origins.
- `ADMIN_BOOTSTRAP_LOGIN_NAME`, `ADMIN_BOOTSTRAP_DISPLAY_NAME`, `ADMIN_BOOTSTRAP_PASSWORD`: one-time CLI inputs for `npm run admin:bootstrap`; they are not read by the HTTP server.

The API currently listens on `127.0.0.1`, which matches the intended Nginx reverse-proxy shape.

With `USE_DATABASE=false`, the API can serve in-memory development data for basic route testing, but authenticated practice sessions and durable wrong-question data require PostgreSQL-backed repositories. Production must run with `USE_DATABASE=true` and a migrated database.

## Production Gaps

The deployment shape is documented, but the current codebase is not yet publicly production-ready. Before launch, add and verify:

- operational policy and UI for administrator/student account lifecycle; backend Admin User manage API, Admin Student Manage API, student password login enforcement, student password change API, and one-time `super_admin` bootstrap already exist;
- old-account migration runbook/CLI for setting temporary passwords while preserving historical practice/wrongbook/learning data;
- secrets management;
- PostgreSQL backup and restore drill;
- external metrics store, alerting, and log aggregation; basic structured request logs and `/api/health/metrics` smoke endpoint already exist;
- rate-limit/CSRF production policy tuning beyond the current configurable minimum implementation;
- first successful remote run and branch protection for the repository CI workflow;
- one repeatable deployment/rollback procedure on the target host.

The local backup/restore drill is now executable:

```sh
npm run ops:backup-restore:docker
```

Detailed backup, restore, migration, deployment, observability smoke, and CI checklists are maintained in [`production-operations.md`](production-operations.md) and [`ci-gate-evidence.md`](ci-gate-evidence.md).
