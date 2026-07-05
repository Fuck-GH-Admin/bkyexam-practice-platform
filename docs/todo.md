# Todo

## Phase 3B

- Add a real PostgreSQL-backed integration test job when CI has a database service available.
- Add import progress reporting for the full corpus import.
- Decide the credential/session policy before enabling production student login.

## Phase 3C

- Backend complete: cookie-backed auth routes, practice session creation/retrieval, objective answer submission, and wrong-question list/mark-mastered API routes are implemented and documented.
- Backend complete: `0002_practice_sessions.sql` adds server-side session storage and practice session tables.
- Backend complete: incorrect auto-graded objective answers upsert `wrong_questions`; self-review answers do not auto-write notebook rows.
- Remaining UI scope moves to Phase 3D/3E.

## Phase 3D

- Initial student practice UI is implemented: login, bank explorer, search/filter, session creation, answer submission, and wrong-question list entry points.
- Dogfood the student UI against a real API/database and fix any browser/runtime issues.
- Long-session answer flow now supports previous/next navigation, numbered question jumps, submitted-answer recall, and per-question result review.
- Wrong-question notebook UI now calls the notebook API with bank filtering, mastered visibility, mark-mastered controls, and empty states.
- Dogfood the refined student UI against a real API/database and fix any browser/runtime issues.

## Phase 3E

- Add objective grading UI for single choice, multiple choice, and yes/no questions.
- Add review-session flows sourced from wrong-question notebook entries.
- Add product copy and analytics around mastered notebook entries.

## Phase 4

- Build the admin mapping UI for category, subject, display name, visibility, status, tags, and notes.
- Add import status views for corpus loading and parser failures.
- Add Linux deployment scripts for Nginx, PostgreSQL, and systemd.

## Deferred Work

- Fill-blank grading.
- Programming grading.
- Office-operation grading.
- Short-answer grading.
- Answer hiding and reveal controls for practice sessions.

## Future Planning

- Admin mapping UI and administrator login.
- Import status dashboard and parser failure views.
- 主观题自评流程。
- 错题再练和历史练习记录。
- 统计面板、题目收藏、全文搜索优化。
- CI real PostgreSQL integration tests.
- Dockerized deployment packaging after native Linux deployment is stable.
