# Database

The PostgreSQL schema is defined in `apps/api/src/db/schema.ts` with Drizzle ORM and materialized through ordered SQL migrations in `apps/api/src/db/migrations`.

## Core Tables

### `classifications`

Stores source question-bank classification nodes.

- `id`: source UUID primary key.
- `name`: classification name.
- `parent_id`: parent classification UUID, nullable for the source root.
- `q_group`: source `qGroup` number.
- `sort`: source sort order.
- `is_deleted`: source deleted flag.

Indexes:

- `classifications_parent_id_idx` on `parent_id`.
- `classifications_q_group_idx` on `q_group`.

### `questions`

Stores imported questions.

- `id`: source UUID primary key.
- `classification_id`: FK to `classifications.id`.
- `q_type`: numeric source question type.
- `normalized_type`: platform question type label.
- `q_group`: source `qGroup` number.
- `content`: raw question content.
- `answer_raw`: raw source answer.
- `analyze_raw`: raw source analysis text.
- `use_count`: source use count.
- `difficulty`: source numeric difficulty.
- `searchable_text`: denormalized text reserved for later search indexing.

Indexes:

- `questions_classification_id_idx` on `classification_id`.
- `questions_normalized_type_idx` on `normalized_type`.

Raw searchable text intentionally does not use a B-tree index. Search indexing will be added later with a PostgreSQL full-text or trigram migration.

### `question_options`

Stores objective-question options.

- `id`: source option UUID primary key.
- `question_id`: FK to `questions.id`.
- `sort`: source option order.
- `content`: option content.

Indexes:

- `question_options_question_id_idx` on `question_id`.

### `bank_mappings`

Stores curated mappings from raw source banks to product-facing categories and metadata.

- `bank_id`: FK to `classifications.id` and primary key.
- `subject_category`: top-level product category.
- `subject_name`: subject label.
- `bank_name`: display bank name.
- `raw_name`: original source bank name.
- `parent_id`: parent classification UUID.
- `q_group`: source `qGroup` number.
- `visible`: whether students can see the bank.
- `status`: curation state such as `review`, `active`, `hidden`, or `deprecated`.
- `difficulty`, `exam_purpose`, `question_types`, `audience`, `keywords`, `description`, `notes`: editable curation metadata.
- `question_count`, `descendant_question_count`: question totals for display and filtering.

Indexes:

- `bank_mappings_subject_category_idx` on `subject_category`.
- `bank_mappings_visible_idx` on `visible`.

### `admin_users`, `admin_sessions`, `admin_user_roles`

Store administrator identity, server-side sessions, and role membership.

- `admin_users`: login name, display name, password hash, active/disabled status, timestamps, and last login timestamp.
- `admin_sessions`: token hash, expiry, revocation timestamp, and `admin_user_id` FK.
- `admin_user_roles`: `(admin_user_id, role)` membership for `content_editor`, `operator`, and `super_admin`.

Indexes:

- `admin_sessions_admin_user_id_idx` on `admin_user_id`.
- `admin_sessions_expires_at_idx` on `expires_at`.
- `admin_user_roles_role_idx` on `role`.

### `audit_logs`

Stores admin-side business audit events.

- `actor_admin_id`: nullable FK to `admin_users`.
- `action`: event name such as `admin.auth.login`, `bank_mapping.update`, or `import_job.create`.
- `resource_type` / `resource_id`: audited resource identity.
- `before`, `after`, `metadata`: JSON payloads.
- `result`: `success` or `failure`.
- `created_at`: event timestamp.

Indexes:

- `audit_logs_actor_created_at_idx` on `(actor_admin_id, created_at DESC)`.
- `audit_logs_resource_idx` on `(resource_type, resource_id, created_at DESC)`.
- `audit_logs_action_created_at_idx` on `(action, created_at DESC)`.

### `import_jobs`

Stores admin-triggered import task state.

- `id`: UUID primary key.
- `kind`: currently `full_corpus_import`.
- `mode`: `dry_run` or future `import`.
- `status`: `queued`, `running`, `succeeded`, `failed`, or `cancelled`.
- `source_dir`: normalized source directory.
- `options`, `progress`, `summary`, `error_summary`: JSON payloads for task execution.
- `created_by_admin_id`: nullable FK to `admin_users`.
- `created_at`, `started_at`, `finished_at`: task timestamps.

Indexes and constraints:

- `import_jobs_status_created_at_idx` on `(status, created_at DESC)`.
- `import_jobs_created_by_idx` on `(created_by_admin_id, created_at DESC)`.
- `import_jobs_one_running_kind_idx` allows only one `running` job for each `kind`.

### `question_quality_flags`

Stores admin-side question quality flags and practice-exclusion overrides without editing imported source question rows.

- `id`: UUID primary key.
- `question_id`: FK to `questions.id`.
- `bank_id`: nearest mapped bank/classification for filtering.
- `flag_type`: quality reason such as `bad_answer`, `missing_option`, `bad_option`, `garbled_content`, `duplicate_question`, `wrong_type`, or `needs_manual_review`.
- `severity`: `low`, `medium`, `high`, or `blocking`.
- `status`: `open`, `resolved`, or `ignored`.
- `note`: admin note.
- `excluded_from_practice`: when true on an open flag, new practice sessions exclude the question from automatic bank selection.
- `created_by_admin_id` / `resolved_by_admin_id`: admin attribution.
- `created_at`, `updated_at`, `resolved_at`: review timestamps.

Indexes:

- `question_quality_flags_question_id_idx` on `question_id`.
- `question_quality_flags_bank_status_idx` on `(bank_id, status)`.
- `question_quality_flags_type_status_idx` on `(flag_type, status)`.
- `question_quality_flags_excluded_open_idx` on excluded open flags used by practice selection.

### `students`

Stores student identities.

- `id`: UUID primary key.
- `login_name`: unique login identifier.
- `display_name`: visible name.
- `password_hash`: nullable password hash placeholder for later auth work.
- `created_at`: creation timestamp.

### `practice_attempts`

Stores submitted answers.

- `id`: UUID primary key.
- `student_id`: FK to `students.id`.
- `question_id`: FK to `questions.id`.
- `bank_id`: FK to `classifications.id`.
- `answer`: submitted answer payload as text.
- `is_correct`: nullable grading result.
- `source`: attempt source, default `auto`.
- `created_at`: submission timestamp.

Indexes:

- `practice_attempts_student_id_idx` on `student_id`.
- `practice_attempts_question_id_idx` on `question_id`.

### `student_sessions`

Stores server-managed login sessions for httpOnly cookie authentication.

- `id`: UUID primary key generated by PostgreSQL.
- `student_id`: FK to `students.id`, deleted when the student is deleted.
- `token_hash`: unique hash of the browser cookie token.
- `created_at`: creation timestamp.
- `expires_at`: session expiration timestamp.
- `revoked_at`: nullable logout/revocation timestamp.

Indexes:

- `student_sessions_student_id_idx` on `student_id`.
- `student_sessions_expires_at_idx` on `expires_at`.

### `practice_sessions`

Stores one student's practice run for one bank.

- `id`: UUID primary key generated by PostgreSQL.
- `student_id`: FK to `students.id`, deleted when the student is deleted.
- `bank_id`: FK to `classifications.id`.
- `mode`: `random` or `sequential`.
- `question_limit`: requested question count, default `70`.
- `question_count`: selected question count.
- `completed_count`: answered/graded question count.
- `correct_count`: auto-graded correct answer count.
- `current_sort`: last saved 1-based question position for resume, default `1`.
- `status`: `active` or `completed`.
- `origin`: `bank` for normal bank practice or `wrongbook` for wrong-question review.
- `created_at`, `updated_at`, `completed_at`: lifecycle timestamps.

Indexes:

- `practice_sessions_student_id_idx` on `student_id`.
- `practice_sessions_bank_id_idx` on `bank_id`.
- `practice_sessions_status_idx` on `status`.
- `practice_sessions_student_status_updated_at_idx` on `(student_id, status, updated_at DESC, id DESC)` for stable active-session paging.
- Partial `practice_sessions_student_completed_at_idx` on `(student_id, completed_at DESC, id DESC)` for completed history.

Saving/clearing a draft, changing a review flag, or saving `current_sort` also updates the parent session's `updated_at`; the student home can therefore order sessions by actual recent activity instead of creation time.

### `practice_session_questions`

Locks selected questions and their 1-based order for a practice session.

- `id`: UUID primary key generated by PostgreSQL.
- `session_id`: FK to `practice_sessions.id`, deleted when the session is deleted.
- `question_id`: FK to `questions.id`.
- `sort`: 1-based question order within the session.
- `answered_at`: nullable answer timestamp.
- `is_correct`: nullable latest objective grading result.

Indexes and constraints:

- `practice_session_questions_session_id_idx` on `session_id`.
- `practice_session_questions_question_id_idx` on `question_id`.
- Unique `session_id` and `question_id`.
- Unique `session_id` and `sort`.

### `practice_session_drafts`

Stores unsubmitted practice answers and review flags for active sessions. Draft rows are scoped by `student_id`, `session_id`, and `question_id`. Drafts are not graded until the session-level submit endpoint is called.

- `id`: UUID primary key generated by PostgreSQL.
- `student_id`: FK to `students.id`, deleted when the student is deleted.
- `session_id`: FK to `practice_sessions.id`, deleted when the session is deleted.
- `question_id`: FK to `questions.id`.
- `draft_answer`: non-null text payload. An empty string means “no answer”; a row may still exist to preserve `marked_for_review=true`.
- `marked_for_review`: whether the student flagged the question for later review.
- `updated_at`: last draft/review update timestamp.

Indexes and constraints:

- `practice_session_drafts_session_id_idx` on `session_id`.
- `practice_session_drafts_question_id_idx` on `question_id`.
- `practice_session_drafts_student_id_idx` on `student_id`.
- `practice_session_drafts_session_question_unique_idx` unique on `session_id` and `question_id`.

### `wrong_questions`

Stores wrong-question notebook rows.

- `id`: UUID primary key.
- `student_id`: FK to `students.id`.
- `question_id`: FK to `questions.id`.
- `bank_id`: FK to `classifications.id`.
- `wrong_count`: accumulated wrong count.
- `last_answer`: most recent wrong answer.
- `mastered`: notebook mastery flag.
- `mastered_at`: nullable mastery timestamp.
- `source`: row source, default `auto`.
- `last_wrong_at`: most recent wrong timestamp.

Indexes:

- `wrong_questions_student_id_idx` on `student_id`.
- `wrong_questions_bank_id_idx` on `bank_id`.
- `wrong_questions_student_question_bank_unique_idx` unique on `student_id`, `question_id`, and `bank_id`.

The unique wrong-question index keeps one notebook row per student, question, and bank, while allowing later attempts to update `wrong_count`, `last_answer`, and `last_wrong_at`.

Wrong-question review screens do not duplicate question content into `wrong_questions`. List summaries join `questions` and `bank_mappings` for bank labels, normalized type, and content preview. Detail review joins `questions` and `question_options` on demand to return full content, options, correct answer, and analysis for the selected row.

Wrong-question review sessions reuse the existing practice session tables. Creating a review session inserts an active `practice_sessions` row with `mode = 'sequential'` and `origin = 'wrongbook'`, locks the selected wrong-question IDs into `practice_session_questions`, and then serves the session through the normal practice retrieval route. A separate practice mode is not required; origin records the creation purpose without changing grading behavior.

## Migrations

`apps/api/src/db/migrations/0001_initial.sql` is the initial PostgreSQL migration and mirrors the initial Drizzle schema. It creates imported content, mapping, student, attempt, and wrong-question tables.

`apps/api/src/db/migrations/0002_practice_sessions.sql` adds cookie session storage and practice session tables. It creates `student_sessions`, `practice_sessions`, and `practice_session_questions`, plus indexes for student lookup, session expiry, bank/status filtering, and locked session question lookup. It includes check constraints for valid practice modes, positive question limits, nonnegative counters, active/completed status, positive session question order, token hash uniqueness, and uniqueness for each session's question membership and sort order.

`apps/api/src/db/migrations/0003_practice_drafts.sql` adds resumable practice progress. It adds `practice_sessions.current_sort` with a positive-order check and creates `practice_session_drafts` for unsubmitted answers and review flags. The unique `(session_id, question_id)` constraint keeps one draft row per locked session question.

`apps/api/src/db/migrations/0004_practice_session_history.sql` adds `practice_sessions.origin`, backfills existing sessions as `bank`, repairs missing completion timestamps on existing completed rows, adds the origin check, and creates the composite active/history paging indexes.

`apps/api/src/db/migrations/0005_admin_foundation.sql` adds administrator identity/session/audit foundations. It creates `admin_users`, `admin_sessions`, `admin_user_roles`, and `audit_logs`, and extends `bank_mappings` with `version`, `updated_at`, and `updated_by_admin_id` for optimistic concurrency and audit ownership.

`apps/api/src/db/migrations/0006_import_jobs.sql` adds Admin Import Jobs. It creates `import_jobs`, indexes status/creator paging, and enforces a partial unique lock so only one same-kind job can be `running` at a time.

`apps/api/src/db/migrations/0007_question_quality_flags.sql` adds Admin Question Review flags. It creates `question_quality_flags`, quality filter indexes, and the excluded-open index used by new practice session selection.

`apps/api/src/db/migrations/0008_student_learning_goals.sql` adds per-student learning goal settings. It creates `student_learning_goals` with bounded nullable targets for daily attempts, weekly active days, and wrong-question review goals.

The migration intentionally avoids a B-tree index on `questions.searchable_text`. That column stores denormalized raw search text, and full-text or trigram search indexing belongs in a later dedicated migration.

Run API migrations with:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/bkyexam npm run db:migrate -w @bkyexam-practice/api
```

The `db:migrate` script reads `.sql` files from `apps/api/src/db/migrations`, applies them in filename order inside a single transaction, and prints the applied file names. `DATABASE_URL` is required and should point at the PostgreSQL database to migrate.

On PowerShell, set `DATABASE_URL` before running migration commands:

```powershell
$env:DATABASE_URL="postgres://bkyexam:bkyexam@127.0.0.1:5432/bkyexam_practice"
npm run db:migrate -w @bkyexam-practice/api
```

On 2026-07-10 the first three migrations were applied successfully to a real PostgreSQL 14 instance before importing the full corpus and running the API/browser smoke flow. On 2026-07-11 the first four migrations, including the history/origin migration, were applied from an empty database by the PostgreSQL 16 integration profile. On 2026-07-14 all eight migrations, including Admin foundation, Import Jobs, Question Review flags, and Student Learning Goals, were applied from an empty database by the Docker PostgreSQL 16 integration profile.

## Isolated Integration Profile

仓库内的最小 PostgreSQL integration profile 会在空数据库上重新执行全部 migration，并验证真实 repository 与 Fastify API wiring：

```sh
npm run test:integration:db:docker
```

该命令使用 Compose profile `test` 在本地临时启动 `bkyexam_test`，完成后自动删除容器。若直接连接已有测试数据库：

```powershell
$env:TEST_DATABASE_URL="postgres://user:password@127.0.0.1:5432/bkyexam_test"
npm run test:integration:db
```

integration fixture 会清空目标数据库业务表，因此测试代码只接受名称为 `test`、以 `test_`/`test-` 开头或以 `_test`/`-test` 结尾的数据库。

完整外部题库的双重导入与幂等检查使用同一安全数据库规则：

```powershell
npm run smoke:import:full:docker -- C:\path\to\BKYExam\Monitor\questionbank
```

该命令执行 migration、清空隔离测试库、按固定 corpus baseline 校验解析结果、连续导入两次并核对最终表计数。

## Post-Import Smoke Check

After importing question-bank data, run the database smoke check to confirm the core import tables are reachable and populated with readable counts:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/bkyexam npm run db:smoke -w @bkyexam-practice/api
```

The command prints pretty JSON with row counts for `classifications`, `questions`, `question_options`, and `bank_mappings`. It exits nonzero when `DATABASE_URL` is missing or the smoke query fails.

Latest real PostgreSQL smoke result after importing the full corpus:

```json
{
  "ok": true,
  "tables": {
    "classifications": 2941,
    "questions": 89922,
    "question_options": 154899,
    "bank_mappings": 2662
  }
}
```
