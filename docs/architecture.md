# Architecture

BKYExam Practice Platform is a lightweight monolith. Phase 1 separates code into npm workspaces, but the deployment shape is intentionally simple:

```text
Browser
  |
  v
Nginx
  |-- static Vite web build
  `-- reverse proxy /api/*
        |
        v
    Fastify API
        |
        v
    PostgreSQL
```

## Components

- `apps/web`: Vite + React web shell. Phase 1 renders the landing shell for the practice platform.
- `apps/api`: Fastify API. Phase 1 exposes `GET /api/health` and contains the importer and database schema foundation. Phase 2 adds the `POST /api/auth/login` contract for student login and the `GET /api/banks` contract for bank explorer lists.
- `packages/shared`: Shared Zod schemas and TypeScript types for question and bank metadata.
- PostgreSQL: Runtime storage target for imported question data, mappings, students, practice attempts, and wrong-question rows.
- Nginx: Linux deployment edge for static assets, TLS termination, and API reverse proxying.

## Runtime Data Access

Runtime requests use PostgreSQL. The web app and API should not scan exported `.txt` files during normal user traffic.

The exported files under `../Monitor/questionbank/` are import inputs. They are parsed into normalized database rows before practice, search, or notebook features serve users.

API routes use repository boundaries so HTTP contracts stay stable while storage evolves. `POST /api/auth/login` is backed by a student-auth repository boundary, `GET /api/banks` returns `{ banks: BankListItem[] }` through a bank repository with `listBanks({ category, keyword })`, and practice session routes use `PracticeRepository` for session creation, retrieval, and answer submission. The app default still uses tiny in-memory bank and practice/session repositories so local route tests and development startup do not require PostgreSQL.

Set `USE_DATABASE=true` for the API process to wire `GET /api/banks`, student login, cookie sessions, and practice sessions to PostgreSQL. At startup, `apps/api/src/index.ts` reads `DATABASE_URL`, creates a PostgreSQL pool, passes `createPgBankRepository(pool)`, `createPgPracticeRepository(pool)`, `createPgStudentAuthRepository(pool)`, and `createPgStudentSessionRepository(pool)` into `buildApp`, and closes the pool when the Fastify app shuts down. With `USE_DATABASE=false`, the API preserves the in-memory bank, practice, student auth, and session repository behavior.

Phase 3C auth uses a server-managed cookie session. On successful `POST /api/auth/login`, the API generates a random 32-byte token, stores only its SHA-256 hash through the session repository, and sends the raw token to the browser in the httpOnly `bky_session` cookie. Authenticated routes read that cookie and resolve the current student through the session repository, which is responsible for ignoring expired or revoked sessions. `POST /api/auth/logout` revokes the token hash when present and clears the browser cookie.

The default app remains database-free for local development and route tests by using in-memory auth and session repositories, so a local login cookie resolves through `GET /api/auth/me`. Production-style `USE_DATABASE=true` startup stores login identities in `students` and persists sessions in `student_sessions`, keeping the session `student_id` foreign key coherent.

Practice sessions are persisted in `practice_sessions` and lock their selected question list in `practice_session_questions`. Creating a session first verifies a visible `bank_mappings` row, then selects questions from the bank classification and all descendants with a recursive CTE. Random mode orders by PostgreSQL `random()`, while sequential mode orders deterministically by question id. The API returns question content and options without raw answers.

Answer submission loads only the current student's session question, grades with the shared `gradeAnswer` function, records an immutable `practice_attempts` row, updates the locked session question's `answered_at` and latest `is_correct`, and recomputes session `completed_count`, `correct_count`, `status`, and `completed_at` from the locked rows. This recomputation prevents repeated submissions from double-counting progress while allowing the latest correctness to replace an earlier answer.

## Local And Deployment Targets

Local native Windows testing is preferred for Phase 1 because the source corpus and current development environment are Windows-native. The production deployment target is Linux with Nginx, PostgreSQL, and systemd-managed Node processes.

Docker can be introduced later if it improves repeatability, but native process deployment is the first target.
