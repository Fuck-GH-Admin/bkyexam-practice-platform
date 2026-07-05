# BKYExam Practice Platform

BKYExam Practice Platform is the Phase 1 foundation for a web-based practice system backed by the existing BKYExam question bank exports.

Phase 1 scope covers:

- npm workspace scaffold for the API, web app, and shared package.
- Shared schemas for question types, objective question detection, bank categories, bank status, and difficulty labels.
- PostgreSQL schema definitions for classifications, questions, options, bank mappings, students, practice attempts, and wrong-question tracking.
- Parser foundation for exported classifications, question files, option files, and raw answer normalization.
- Fastify health API at `GET /api/health`.
- Handoff documentation for architecture, database, importer, mapping, deployment, and future work.

Source data is read from `../Monitor/questionbank/`. The source `.txt` export files are inputs only and are not modified by the platform.

## Commands

Run these from `PracticePlatform`:

```sh
npm install
npm run test --workspaces
npm run typecheck --workspaces
npm run build --workspaces
```

Start the API during development:

```sh
npm run dev -w @bkyexam-practice/api
```

Start the local PostgreSQL database during development:

```sh
docker compose up -d postgres
```

Configure the API database connection:

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

Run database migrations after PostgreSQL is available:

```sh
npm run db:migrate -w @bkyexam-practice/api
```

The Docker PostgreSQL service is for local development only. Production can use native PostgreSQL.

Start the web app during development:

```sh
npm run dev -w @bkyexam-practice/web
```

The root `npm run dev` script also starts the API. The root `npm run dev:web` script starts the web app.

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [Importer](docs/importer.md)
- [Mapping](docs/mapping.md)
- [Deployment](docs/deployment.md)
- [Todo](docs/todo.md)
