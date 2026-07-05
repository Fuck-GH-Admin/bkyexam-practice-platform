# Deployment

The primary deployment target is a small Linux host running Nginx, PostgreSQL, and systemd-managed Node processes.

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

The expected early production size is fewer than 100 users on a 2 core, 2 GB server.

## Native Process First

Native process deployment is preferred first:

1. Install Node matching `package.json` engines, PostgreSQL, and Nginx on Linux.
2. Run `npm install` from `PracticePlatform`.
3. Run `npm run build --workspaces`.
4. Configure API runtime environment variables, especially `DATABASE_URL`, `USE_DATABASE=true`, `COOKIE_SECRET`, and `COOKIE_SECURE=true` when behind HTTPS.
5. Run database migrations with `npm run db:migrate -w @bkyexam-practice/api`.
6. Import or refresh the question-bank corpus if needed, then run `npm run db:smoke -w @bkyexam-practice/api`.
7. Run the API with `node apps/api/dist/index.js` under systemd.
8. Serve `apps/web/dist` through Nginx.
9. Reverse proxy `/api/` to the local Fastify port.

Docker is optional. It may be useful after Phase 1 if deployment scripts, database migrations, and import jobs need stricter packaging. It is not required for the first Linux deployment.

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

Migrations run all files in `apps/api/src/db/migrations` in filename order. Phase 3C requires both `0001_initial.sql` and `0002_practice_sessions.sql`; the second migration adds server-side cookie sessions and practice session storage.

Then import the source question bank and run a smoke check:

```powershell
npm run import:db -w @bkyexam-practice/api -- C:\path\to\BKYExam\Monitor\questionbank
npm run db:smoke -w @bkyexam-practice/api
```

Observed local Docker PostgreSQL result after the real corpus import:

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

Phase 3C live migration check attempted to start this local Docker PostgreSQL service, but Docker Desktop's Linux engine was not available on the workstation (`//./pipe/dockerDesktopLinuxEngine` was missing). Because PostgreSQL could not be started, the requested live `db:migrate` and `db:smoke` commands were not executed against Docker during that check.

## Runtime Configuration

The API currently reads configuration from environment variables through `apps/api/src/config.ts`:

- `NODE_ENV`: defaults to `development`.
- `PORT`: defaults to `3000`.
- `DATABASE_URL`: defaults to `postgres://postgres:postgres@127.0.0.1:5432/bkyexam_practice`.
- `USE_DATABASE`: accepts `true` or `false` and defaults to `false`.
- `COOKIE_SECRET`: signs cookie data and defaults to `dev-cookie-secret-change-me` for local development. Set a long random value in production.
- `COOKIE_SECURE`: accepts `true` to require HTTPS-only cookies. Defaults to `false`; set to `true` behind production HTTPS.
- `SESSION_TTL_DAYS`: positive integer session lifetime in days, default `30`.

The API currently listens on `127.0.0.1`, which matches the intended Nginx reverse-proxy shape.

With `USE_DATABASE=false`, the API can serve in-memory development data for basic route testing, but authenticated practice sessions and durable wrong-question data require PostgreSQL-backed repositories. Production should run with `USE_DATABASE=true` and a migrated database.
