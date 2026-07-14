# Roadmap

路线图按依赖和风险排序，不再继续使用已失真的 Phase 3B/3C/3D 清单。

后端完成度、未达成目标与下一步执行计划详见
[`backend-completeness-plan.md`](./backend-completeness-plan.md)。

## Completed Backend B9.13 PR / Branch Protection / Required Checks — 2026-07-15

- [x] 创建 PR `#2`：`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2`。
- [x] PR head commit `07a7892b0a6ea5e50fdeb5f4ec60090bdd54dc84` 已触发 pull_request CI。
- [x] PR `Quality` workflow run `29376220149` 通过。
- [x] PR `quality` job 通过。
- [x] PR `postgres-integration` job 通过。
- [x] `main` branch protection 已启用。
- [x] required status checks 已配置：`quality`、`postgres-integration`。
- [x] required approving reviews 已配置为 `1`，dismiss stale reviews、admin enforcement、required conversation resolution 已启用。
- [x] force pushes / deletions 已禁用。
- [x] 未合并 PR，未替代 owner/reviewer 完成 review，未声明公开生产可发布。

后续代码阶段：

- [ ] B9.14 Staging Production Gate / Deployment Smoke / Performance Evidence（需要提供/确定 staging/prod-like 目标环境）。

## Completed Backend B9.12 Remote Publication / CI Validation — 2026-07-15

- [x] 推送 `codex/practice-platform-stabilization` 到 `origin`。
- [x] 远端分支 commit `96f0dc090adb44dba21ba65354af823cafd48d44` 已触发 GitHub Actions。
- [x] `Quality` workflow run `29373386558` 通过。
- [x] `quality` job 通过。
- [x] `postgres-integration` job 通过。
- [x] `docs/ci-gate-evidence.md` 和 `docs/production-deployment-evidence.md` 已记录远端验证证据。
- [x] 未创建 PR，未修改 `main` branch protection，未声明公开生产可发布。

## Completed Backend B9.11 Production Deployment Evidence / Remote CI Closure — 2026-07-15

- [x] 新增 `npm run ops:deployment-evidence`。
- [x] 支持 `--template` 生成生产部署 evidence JSON 模板。
- [x] 支持 `--evidence=<file> --require-ready` 校验 local gates、production gate、legacy migration、remote CI、branch protection、rollback 和 smoke 证据。
- [x] 新增 `docs/production-deployment-evidence.md`。
- [x] 更新 `docs/ci-gate-evidence.md`，记录当前远端审计：远端工作分支不存在、workflow/runs 为空、`main` 未启用 branch protection。
- [x] 不擅自推送远端分支、不擅自创建 PR、不擅自修改 branch protection。

## Completed Backend B9.9/B9.10 Identity Migration And Admin Security — 2026-07-15

- [x] 新增 `npm run ops:legacy-student-password-migration`。
- [x] 旧学生账号迁移工具默认 dry-run，必须显式 `--apply` 才写库。
- [x] 只迁移 `password_hash IS NULL` 的学生，写入 hash、设置 `password_reset_required=true`、清空失败/锁定状态。
- [x] 默认撤销未过期 student session，支持 `--no-revoke-sessions`。
- [x] 支持统一临时密码环境变量或 `--credentials-out=artifacts/.../credentials.csv` 生成每人独立临时密码。
- [x] JSON 输出和 audit log 不包含明文临时密码。
- [x] 新增 `0011_admin_identity_security.sql`，扩展管理员密码变更时间、失败计数、失败窗口和锁定时间。
- [x] 管理员登录失败按默认 10 次 / 30 分钟窗口 / 15 分钟锁定；锁定返回 `423` 并写 audit。
- [x] 管理员成功登录或被重置密码时清空失败/锁定状态。
- [x] 不新增正式前端、不开放公网注册、不实现邮箱/短信找回。

## Completed Backend B9.8 Production Gate / Migration Runbook — 2026-07-15

- [x] 新增 `npm run ops:production-gate`。
- [x] 检查 `DATABASE_URL`、`USE_DATABASE`、`COOKIE_SECRET`、`COOKIE_SECURE`、rate limit、CSRF origin、legacy passwordless 开关。
- [x] PostgreSQL 汇总学生身份迁移状态：password protected、legacy passwordless、reset required、locked。
- [x] `legacyPasswordlessStudents > 0` 作为 production blocking failure。
- [x] 新增 `docs/production-gate-runbook.md`，固定旧账号迁移步骤、exit code 和证据包。
- [x] 测试覆盖 env gate、student migration summary、CLI exit code 和 pool cleanup。
- [x] 不新增正式前端，不批量写入明文/临时密码。

## Completed Backend B9.7 Password Login Enforcement — 2026-07-15

- [x] shared v1 `AuthLoginRequestV1Schema` 正式要求 `password`。
- [x] shared v1 新增 `ChangeStudentPasswordRequestV1Schema` / `ChangeStudentPasswordResponseV1Schema`。
- [x] `POST /api/auth/login` 默认要求密码，未知学生不再公网自动创建。
- [x] `STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED=false` 作为默认；显式开启时仅用于旧账号迁移/本地开发。
- [x] 密码错误递增 `failed_login_count`，默认 10 次 / 30 分钟窗口后锁定 15 分钟。
- [x] 成功登录清空失败计数、窗口和锁定状态，并更新 `last_login_at`。
- [x] `POST /api/auth/password/change` 校验当前密码、写入新 hash、清空 `passwordResetRequired` 与失败/锁定状态。
- [x] route/unit/shared/PostgreSQL integration 覆盖无密码默认失败、legacy 兼容、临时密码登录、改密与旧密码失效。
- [x] 不新增正式前端，不删除旧账号或历史学习数据。

## Completed Backend B9.5 — 2026-07-15

- [x] 新增 migration `0010_student_identity_security.sql`。
- [x] 扩展 `students`：`class_name`、`group_name`、`status`、`password_reset_required`、`password_changed_at`、登录失败计数、临时锁定、`last_login_at`、`updated_at`、`created_by_admin_id`。
- [x] migration 回填 `202502040201`–`202502040230` 为 `2班`。
- [x] shared Auth contract 支持 `className`、`groupName`、`passwordResetRequired`。
- [x] PostgreSQL student auth/session repository 映射新字段。
- [x] student session 查询排除 disabled student。
- [x] route/unit/shared/PostgreSQL integration 覆盖学生身份安全字段。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B9.6 Admin Student Manage API — 2026-07-15

- [x] shared v1 contract 覆盖 Admin Student list/detail/create/bulk-create/update/reset-password/revoke-sessions。
- [x] RBAC 新增 `student_account:read/write/reset_password/revoke_session`。
- [x] `operator` 可进行学生账号日常运营，`content_editor` 默认无学生账号权限，`super_admin` 全权限。
- [x] `GET /api/admin/students` 支持 search/filter/page。
- [x] `POST /api/admin/students` 支持单个创建、hash 初始密码、不返回明文密码。
- [x] `POST /api/admin/students/bulk-create` 支持最多 200 个 JSON 批量创建和 created/skipped/failed 部分结果。
- [x] `PATCH /api/admin/students/:studentId` 支持 displayName/status/className/groupName。
- [x] `POST /api/admin/students/:studentId/reset-password` 设置 `passwordResetRequired=true`、清空失败/锁定状态并可撤销现有 session。
- [x] `POST /api/admin/students/:studentId/revoke-sessions` 撤销学生未过期 session。
- [x] audit log 覆盖 create/bulk-create/update/reset-password/revoke-session。
- [x] route/unit/shared/PostgreSQL integration 覆盖。

## Completed Backend B9.4 Strategy — 2026-07-15

- [x] 冻结正式身份安全策略文档：`docs/identity-security-strategy.md`。
- [x] 决定学生账号来源为管理员批量创建/导入，不开放公网自助注册。
- [x] 决定学生登录凭据为用户名/学号 + 密码。
- [x] 决定密码找回由管理员重置，暂不做邮箱/短信找回。
- [x] 决定学生轻量组织字段为 `className` / `groupName` 文本字段。
- [x] 记录 `202502040201`–`202502040230` 属于 `2班`，其余暂未定。
- [x] 决定登录失败策略放宽但保留失败计数和临时锁定。
- [x] 决定旧账号保留，不清空历史学生和学习数据。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B9.3 — 2026-07-15

- [x] 新增 shared v1 `MetricsResponseV1Schema`。
- [x] 新增 Fastify observability hook，记录 `event=http_request`、`requestId`、`method`、`route`、`statusCode`、`statusBucket`、`durationMs`、`remoteAddress` 和 `userAgent`。
- [x] 新增 `GET /api/health/metrics`，返回进程内 HTTP total requests、status buckets、per-route counters、平均耗时和 process memory summary。
- [x] route/shared/PostgreSQL integration 覆盖 metrics contract 与 smoke endpoint。
- [x] 新增 `docs/ci-gate-evidence.md`，固定远端 CI、branch protection 和 deployment evidence 模板。
- [x] 更新 production operations runbook，把 metrics endpoint 纳入 postflight。
- [x] 不新增前端页面，不提前做最终视觉。

仍保留不做：

- [ ] 不接入 Prometheus/外部 metrics store。
- [ ] 不接入正式 alerting。
- [x] 已在 B9.12 推送远端分支并完成当前分支首次远端 CI 验收。
- [ ] 不替项目 owner 设置 branch protection；`main` 保护与 required checks 仍需后续实际确认。

## Completed Backend B9.2 — 2026-07-14

- [x] 新增 `npm run ops:backup-restore:docker`。
- [x] 隔离 PostgreSQL 演练执行全部 migration。
- [x] 演练 fixture 覆盖题库、学生、题目、选项、attempt、wrongbook、learning goals 和 question bookmarks。
- [x] 使用 `pg_dump` 生成 backup，并恢复到 `bkyexam_restore_test`。
- [x] 比较源库/恢复库关键表计数。
- [x] 新增 production operations runbook，覆盖 backup、restore drill、migration rollback/forward-fix、deployment checklist 和 remote CI/branch protection gate。
- [x] `artifacts/` 加入 `.gitignore`，避免演练 dump 进入 Git。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B9.1 — 2026-07-14

- [x] 新增 shared v1 Readiness schema。
- [x] 新增 `GET /api/health/readiness`，支持 DB disabled/ok/down 三态。
- [x] PostgreSQL runtime readiness 使用 `SELECT 1`，失败返回 `503`。
- [x] 所有响应写入 `x-request-id`，支持复用客户端 request id。
- [x] 未捕获异常返回结构化 `{ error, requestId }`。
- [x] 增加基础安全 headers。
- [x] 增加可配置内存级 rate limit。
- [x] 增加可配置 CSRF Origin/Referer guard。
- [x] route/shared/config/PostgreSQL integration 覆盖。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B7.4 — 2026-07-14

- [x] 新增 migration `0009_question_bookmarks.sql`。
- [x] 新增 shared v1 Learning Review Mark schema。
- [x] 实现 `GET /api/learning/review-marks`，支持 `bankId`、`kind`、`limit/offset`。
- [x] 实现 `PUT /api/learning/review-marks`，支持题目收藏、长期复习标记、note/source 和 upsert。
- [x] 实现 `DELETE /api/learning/review-marks/:id`，保持学生 ownership boundary。
- [x] 实现 memory/PostgreSQL Learning review marks repository。
- [x] route fail-closed 覆盖不合法 review mark response。
- [x] PostgreSQL integration 覆盖创建、列表过滤、学生隔离、持久化和删除。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B7.3 — 2026-07-14

- [x] 新增 migration `0008_student_learning_goals.sql`。
- [x] 新增 shared v1 Learning Goals schema 和 feedback signal schema。
- [x] 实现 `GET /api/learning/goals`。
- [x] 实现 `PUT /api/learning/goals`，支持 daily attempts、weekly active days、wrongbook review 三类目标 upsert。
- [x] 返回今日/近 7 日进度、目标完成状态和错题复习反馈信号。
- [x] 实现 memory/PostgreSQL Learning goals repository。
- [x] route fail-closed 覆盖不合法 goals response。
- [x] PostgreSQL integration 覆盖默认目标、目标持久化和反馈信号。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B7.2 — 2026-07-14

- [x] 新增 shared v1 Learning Trends schema。
- [x] 实现 `GET /api/learning/trends?days=7..90`。
- [x] 返回 UTC daily buckets：sessionsStarted、sessionsCompleted、attempts、graded/correct attempts、accuracy、wrongQuestionsTouched。
- [x] 返回 summary：activeDays、currentStreakDays、longestStreakDays 和窗口总计。
- [x] 实现 memory/PostgreSQL Learning trends repository。
- [x] route fail-closed 覆盖不合法 trends payload。
- [x] PostgreSQL integration 覆盖真实趋势聚合。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B7.1 — 2026-07-14

- [x] 新增 shared v1 Learning Dashboard schema。
- [x] 实现 `GET /api/learning/dashboard`。
- [x] 返回 active/completed/review session 数、attempt 数、graded/correct attempt 和 accuracy。
- [x] 返回最近题库 recentBanks。
- [x] 返回按题型统计的 attempts/correct/accuracy/wrongQuestions。
- [x] 返回 wrongbook total/mastered/pending/lastWrongAt 摘要。
- [x] 实现 memory/PostgreSQL LearningDashboardRepository。
- [x] route fail-closed 覆盖不合法 learning payload。
- [x] PostgreSQL integration 覆盖真实学习概览聚合。
- [x] 不新增前端页面，不提前做最终视觉。

## Completed Backend B5.9 — 2026-07-14

- [x] 新增 `ADMIN_IMPORT_ENABLE_WRITE`，默认关闭 true import 写入。
- [x] API runtime 在 PostgreSQL 模式下注入真实 Question Bank import runner。
- [x] `mode=import` 仅在 `ADMIN_IMPORT_ENABLE_WRITE=true` 且 source allowlist 通过时执行。
- [x] true import 复用事务导入，写入 classifications、questions、question_options、bank_mappings。
- [x] `generateMappings=false` 时跳过 bank_mappings 写入。
- [x] 重复 true import 保持 upsert 幂等。
- [x] 失败 true import 记录 failed job/errorSummary，并回滚 corpus 写入。
- [x] `resetBeforeImport=true` 在 import mode 中仍返回 `422`，不做清库重导。
- [x] PostgreSQL integration 覆盖成功写入、幂等、失败回滚/error report 和 reset gate。
- [x] 不创建正式 Admin 前端。

## Completed Backend B5.8 — 2026-07-14

- [x] 实现 Admin User manage API：list/detail/create/update。
- [x] `admin_user:manage` 权限守卫，仅 `super_admin` 可用。
- [x] 创建/修改密码只写入 hash，不在 response 暴露 password/passwordHash。
- [x] 阻止禁用或移除最后一个 active `super_admin`。
- [x] 写入 `admin_user.create` / `admin_user.update` audit log。
- [x] 实现 `GET /api/admin/import-jobs/:jobId/errors`。
- [x] PostgreSQL integration 覆盖 Admin User manage 与 Import Error Report。
- [x] 不创建正式 Admin 前端。

## Completed Backend B5.7 — 2026-07-14

- [x] 新增 `npm run admin:bootstrap`。
- [x] 通过 `ADMIN_BOOTSTRAP_LOGIN_NAME`、`ADMIN_BOOTSTRAP_DISPLAY_NAME`、`ADMIN_BOOTSTRAP_PASSWORD` 创建第一个 `super_admin`。
- [x] 已存在 `super_admin` 时拒绝重复 bootstrap。
- [x] loginName 被非 super admin 占用时返回 `login_name_conflict`。
- [x] bootstrap 成功写 `admin_user.bootstrap` audit log，且不输出明文密码。
- [x] 新增 shared v1 Admin Audit Log schema。
- [x] 实现 `GET /api/admin/audit-logs`。
- [x] 复用 `audit_log:read` 权限守卫，覆盖 `401/403`。
- [x] 支持 action/resource/actor/result/time/pagination filters。
- [x] PostgreSQL integration 覆盖 bootstrap、Audit Log read 和权限边界。
- [x] 新增 [`admin-console-ia.md`](./admin-console-ia.md)，先做管理端信息架构静态审核，不创建正式 Admin 前端。

## Completed Backend B5.6 — 2026-07-14

- [x] 新增 migration `0007_question_quality_flags.sql`，建立 `question_quality_flags`。
- [x] 新增 shared v1 Admin Question Review schema。
- [x] 实现 `GET /api/admin/question-review`。
- [x] 实现 `PATCH /api/admin/question-review/:questionId`。
- [x] 复用 `question_review:read/write` 权限守卫，覆盖 `401/403`。
- [x] 支持 open/resolved/ignored quality flag。
- [x] 支持 flag type、severity、note、created/resolved admin attribution。
- [x] 支持 `excludedFromPractice=true`，新建普通练习 session 会排除 open excluded 题目。
- [x] System Status quality summary 接入真实表。
- [x] 写操作记录 `question_review.flag_add`、`question_review.flag_resolve`、`question_review.exclude_update` audit log。
- [x] PostgreSQL integration 覆盖 Admin Question Review、practice exclusion 与 status summary。
- [x] 不创建正式 Admin 前端。

## Completed Backend B5.5 — 2026-07-13

- [x] 新增 migration `0006_import_jobs.sql`，建立 `import_jobs`。
- [x] 新增 shared v1 Admin Import Job schema。
- [x] 实现 `GET /api/admin/import-jobs`。
- [x] 实现 `POST /api/admin/import-jobs`。
- [x] 实现 `GET /api/admin/import-jobs/:jobId`。
- [x] 实现 `GET /api/admin/import-jobs/:jobId/errors`。
- [x] 复用 `import_job:read/create` 权限守卫，覆盖 `401/403`。
- [x] 支持 `ADMIN_IMPORT_ALLOWED_ROOTS` source allowlist。
- [x] 支持同类 `running` job lock，冲突返回 `409`。
- [x] 先启用 `mode=dry_run`；`mode=import` 在 B5.9 前明确返回 `422`。
- [x] dry-run 写入 progress、summary、errorSummary。
- [x] `resetBeforeImport=true` 需要 `super_admin`。
- [x] 成功创建写 `import_job.create` audit log。
- [x] System Status 可返回 latest import job。
- [x] PostgreSQL integration 覆盖 Admin Import Jobs。
- [x] 不创建正式 Admin 前端。

## Completed Backend B5.4 — 2026-07-13

- [x] 新增 shared v1 Admin System Status schema。
- [x] 实现 `GET /api/admin/system/status`。
- [x] 复用 `system_status:read` 权限守卫，覆盖 `401/403`。
- [x] 返回 API version、DB readiness、migration 文件摘要。
- [x] 返回 corpus counts 与学生可见题库数量。
- [x] 在 `import_jobs` 表存在时返回 running/latest job 摘要；表不存在时安全返回 `tableExists=false`。
- [x] 在 `question_quality_flags` 表存在时返回质量摘要；表不存在时安全返回 `tableExists=false`。
- [x] PostgreSQL integration 覆盖 Admin System Status。
- [x] 不创建正式 Admin 前端。

## Completed Backend B5.3 — 2026-07-13

- [x] 新增 shared v1 Admin Bank Mapping write/bulk-status schema。
- [x] 实现 `PATCH /api/admin/bank-mappings/:bankId`。
- [x] 实现 `POST /api/admin/bank-mappings/bulk-status`。
- [x] `PATCH` 支持 metadata 字段、`visible/status`、`expectedVersion` optimistic concurrency。
- [x] 批量状态更新支持部分成功，并限制单次最多 100 个 bank。
- [x] 写操作刷新 `version`、`updated_at`、`updated_by_admin_id`。
- [x] 写操作写 `bank_mapping.update` audit log。
- [x] 覆盖 `401/403/400/404/409/422` 与批量部分失败。
- [x] PostgreSQL integration 覆盖 PATCH、bulk-status、version conflict、audit 与学生题库隐藏过滤。
- [x] 不创建正式 Admin 前端。

## Completed Backend B5.1 — 2026-07-13

- [x] 新增 migration `0005_admin_foundation.sql`，建立 `admin_users`、`admin_sessions`、`admin_user_roles`、`audit_logs`。
- [x] 为 `bank_mappings` 增加 `version`、`updated_at`、`updated_by_admin_id`，为后续并发控制和审计归属做准备。
- [x] 实现 Admin Auth repository/service/session，支持 PostgreSQL 与 memory 双路径。
- [x] 实现独立 `bky_admin_session`，与学生 `bky_session` 隔离。
- [x] 实现 RBAC helper：`content_editor`、`operator`、`super_admin` 与显式 permission list。
- [x] 实现 audit service 和 PostgreSQL `audit_logs` writer。
- [x] 实现 `POST /api/admin/auth/login`、`GET /api/admin/me`、`POST /api/admin/auth/logout`。
- [x] 新增 shared v1 Admin Auth schema。
- [x] 覆盖 route/unit/schema/migration/PostgreSQL integration 测试。
- [x] 不创建默认本地管理员账号。

## Completed Backend B5.2 — 2026-07-13

- [x] 新增 shared v1 Admin Bank Mapping read schema。
- [x] 实现 `GET /api/admin/bank-mappings`，支持 status、visible、subject、keyword、qGroup、parentId、hasObjectiveQuestions、limit、offset。
- [x] 实现 `GET /api/admin/bank-mappings/:bankId`，返回 parentName、questionTypeCounts 和 studentPreview。
- [x] 实现 Admin Bank Mapping memory/PostgreSQL repository。
- [x] 复用 `bank_mapping:read` 权限守卫，覆盖 `401/403/400/404`。
- [x] PostgreSQL integration 覆盖 Admin Bank Mapping list/detail。
- [x] 不创建正式 Admin 前端。

## Completed Backend B4 — 2026-07-13

- [x] 新增 [`admin-backend-contract.md`](./admin-backend-contract.md)。
- [x] 固定管理端第一版四个工作流：题库整理、导入任务、题目质检、系统状态。
- [x] 明确管理员角色：`content_editor`、`operator`、`super_admin`。
- [x] 明确管理端权限模型、独立 `bky_admin_session` 和 `/api/admin/*` namespace。
- [x] 设计 Admin Auth、Bank Mapping、Import Job、Question Review、System Status、Audit Log API。
- [x] 设计 B5 所需 migration：admin users/sessions/roles、audit logs、bank mapping version、import jobs、question quality flags。
- [x] 明确第一版不直接编辑原始题目，采用 mapping override 与 quality flag。
- [x] `npm run verify:docker` 通过。

## Completed Backend B3 — 2026-07-13

- [x] 新增 shared v1 `auth.ts`，覆盖 login/me/logout response 和学生 DTO。
- [x] 新增 shared v1 `catalog.ts`，覆盖学生端 bank list response。
- [x] 新增 shared v1 `error.ts`，固定 `{ error: string }` 通用错误形状。
- [x] 新增 shared v1 `health.ts`，覆盖 `/api/health` response。
- [x] Auth、Catalog、Health API 成功响应执行 shared schema parse。
- [x] Web 登录、恢复登录、退出和题库列表执行 shared schema parse。
- [x] Web API helper 对非 2xx response 使用 `ApiErrorResponseV1Schema`。
- [x] 增加 Auth/Catalog fail-closed route 回归。
- [x] `npm run verify:docker` 通过。

## Completed Backend B2 — 2026-07-13

- [x] 新增 `WrongQuestionService`，由 service 编排错题再练创建。
- [x] 新增 `PracticeSessionService.createSessionFromQuestionIds`，统一负责显式题目列表创建 Practice session。
- [x] 将 `WrongQuestionRepository.createReviewSession` 改为 `listReviewCandidates`。
- [x] Wrongbook repository 不再直接写 `practice_sessions` 或 `practice_session_questions`。
- [x] 保持 `/api/wrong-questions/review-sessions` response、`origin=wrongbook` 与 ownership boundary 不变。
- [x] 增加 service/repository 回归测试。
- [x] `npm run verify:docker` 通过。

## Completed Backend B1 — 2026-07-13

- [x] 将 Practice DTO aliases、`PracticeRepository` 和 `CompletedSessionError` 提取到 `apps/api/src/modules/practice/contracts.ts`。
- [x] 将 answer serialization/parsing 提取到 `answerCodec.ts`。
- [x] 将客观题判分规则迁移到 `modules/practice/grading.ts`，并保留旧 `practice/grading.ts` compatibility barrel。
- [x] 将 in-memory Practice repository 提取到 `memoryRepository.ts`。
- [x] 将 PostgreSQL Practice repository、SQL mapper 与 transaction helper 提取到 `pgRepository.ts`。
- [x] 保留旧 `practice/repository.ts` compatibility barrel，避免一次性修改 route/test import。
- [x] 保持 HTTP contract、shared v1 schema、SQL transaction 语义与 Web 行为不变。
- [x] `npm run verify:docker` 通过。

## Completed Stabilization — 2026-07-10/11

- [x] 建立独立稳定化 worktree。
- [x] 保留服务器草稿、存疑和整卷提交语义，迁移 PC 练习台与提交检查交互。
- [x] 将 practice model、PracticeDesk、SubmitCheckDialog 从 `App.tsx` 提取。
- [x] 修复错题参考答案 UUID 泄漏。
- [x] 修复错题用户答案 UUID 展示。
- [x] 修复错题再练 session hydration。
- [x] 全量 281 Vitest、typecheck、build、3 条 Playwright 与 PostgreSQL integration 通过。
- [x] 完整真实题库导入 PostgreSQL 并 smoke。
- [x] 真实 API 闭环与真实浏览器闭环通过。
- [x] 更新当前状态、产品边界、架构和 API 文档。

## P0 — Freeze Semantics And Make Verification Repeatable

目标：把本轮“临时验证成功”升级成仓库可重复执行的质量门。

- [x] 在仓库中增加 Playwright E2E 配置，不依赖临时 runner。
- [x] 增加 PostgreSQL integration test job。
- [x] 为完整导入提供可选的慢速 smoke profile。
- [x] 为 API DTO 增加共享 Zod contract，覆盖 Practice、Wrongbook、Auth、Catalog、Error、Health，并在 API/Web 两侧 runtime parse。
- [x] 明确并版本化 `completedCount` 语义为 answered/graded questions；后续更名必须走显式迁移。
- [x] 降低测试中的 Fastify request log 噪音。
- [x] 增加 Boolean false、opaque/UUID option answer 和不合法 response fail-closed 回归。
- [ ] 增加超长题干、异常空选项、富文本、图片题和异常 Unicode fixture。

完成标准：

- 新环境按文档可以一条链路启动 DB、迁移、导入并跑 E2E。
- CI 同时验证 unit、typecheck、build、PostgreSQL integration。

## P1 — Product Definition And Student Information Architecture

目标：先让学生层“对象、导航、状态”清楚，再做最终视觉。

- [x] 确认学生首页结构：继续练习、选择题库、错题本、历史。
- [x] 定义多个 active session 的展示与处理规则。
- [x] 设计并实现练习历史 API 和结果详情入口。
- [x] 增加 URL router 与可链接页面。
- [ ] 固定登录、无数据、加载、保存失败、提交失败、session 已完成等状态。
- [x] 决定正式身份策略：管理员批量创建学生、用户名/学号 + 密码、管理员重置密码、`className/groupName` 轻量字段、旧账号保留。
- [ ] 对当前练习台做可用性测试，不做大规模视觉换肤。

完成标准：

- 学生端 sitemap、状态机和主要页面验收标准已确认。
- 真实 API 可以支持 sitemap 中的每个页面。

## P2 — Gradual Modularization

目标：解决目录混乱，但不做大爆炸重构。

### Web

- [ ] 创建 `src/app`，迁移 session bootstrap、shell 和 navigation。
- [x] 创建 `src/app/router.ts`，固定学生端可恢复 URL。
- [x] 创建 `features/sessions`，提取学生首页、历史和会话卡片。
- [ ] 创建 `features/auth`。
- [ ] 创建 `features/catalog`。
- [ ] 创建 `features/wrongbook`。
- [ ] 创建 `shared/api`，统一 fetch、错误和 auth handling。
- [ ] 将 `App.tsx` 降到只负责 app composition。

### API

- [ ] 建立 `modules/auth`、`modules/catalog`、`modules/practice`、`modules/wrongbook`。
- [ ] 拆分 `practice/repository.ts`：
  - [x] contract/DTO
  - [x] memory repository
  - [x] PostgreSQL repository
  - [x] answer codec
  - [ ] submission service
- [ ] 拆分 practice route validation 与错误映射。
- [x] 把 Wrongbook 创建再练 session 改为 service 调用 Practice。
- [ ] 将 `db/config/http` 移到 platform 层。

完成标准：

- 每个业务模块可独立定位 route、service、contract、repository。
- 无行为变化，全量质量门持续通过。

## P3 — Admin MVP Design And Implementation

目标：先做可运营的最小管理闭环。

### Product Design

- [x] 确认管理员角色：content editor、operator、super admin。
- [x] 设计题库整理、导入任务、题目质检、系统状态四个工作流。
- [ ] 用文档、流程图、字段表和静态 wireframe 验证工作流与所需后端 command；暂不启动正式管理端前端实现。

### Backend

- [x] 管理员 identity、session 和 RBAC。
- [x] `/api/admin/bank-mappings` 列表、详情。
- [x] `/api/admin/bank-mappings` 更新、批量状态。
- [x] mapping 写入版本/并发控制与 audit log。
- [x] import job table、dry-run 触发、进度、结果和错误摘要。
- [x] 题目质检标记与学生端排除策略。
- [x] 初始 `super_admin` bootstrap。
- [x] Audit Log read API。
- [x] Admin User 管理。
- [x] 真正执行写入的 import mode（受 `ADMIN_IMPORT_ENABLE_WRITE=true` gate 保护；reset 仍未启用）。
- [ ] import reset、cancel/retry 和异步 worker/队列。

### Frontend

- [ ] 创建独立 `apps/admin`。
- [ ] 实现管理 shell、导航和权限守卫。
- [ ] 实现题库整理表格/详情。
- [ ] 实现导入任务状态。
- [ ] 实现只读题目质检与异常标记。

完成标准：

- 管理员可以从导入结果到题库发布完成最小闭环。
- 所有管理写操作有权限和审计。

## P4 — Complete Student Learning Loop

- [x] 练习历史和历史结果回看。
- [x] 错题再练反馈后端信号。
- [ ] 更细的错题掌握规则与错因模型。
- [x] 题目收藏/存疑长期化独立模型。
- [x] 基础学习统计后端：练习次数、正确率、错题摘要。
- [x] 最近使用题库后端，不先做复杂算法。
- [x] 周期趋势和 activity streak 后端 API。
- [x] 学习目标后端 API。
- [ ] 学习统计前端展示。
- [ ] 主观题自评流程。
- [ ] 填空题判分。
- [ ] 编程与 Office 操作题采用独立执行/评测设计，不塞进现有 objective grader。

## P5 — Final Visual System

进入条件：

- P1 学生 sitemap 稳定。
- P3 管理工作流稳定。
- 主要 API contract 不再频繁改变。
- Web 目录已按 feature 拆分。

工作：

- [ ] 建立 BKYExam 品牌方向和设计原则。
- [ ] 建立 primitive/semantic/component tokens。
- [ ] 分别设计学生端与管理端视觉层级。
- [ ] 完成 typography、spacing、color、form、table、dialog、navigation、feedback 规范。
- [ ] 完成 desktop/tablet/mobile responsive。
- [ ] 完成键盘、focus、对比度、读屏等无障碍。
- [ ] 对登录、首页、题库、练习、提交、结果、错题、管理工作流逐页验收。

原则：

> 先设计功能、流程和数据语义，不先做正式前端；可运行前端等后端 contract/command 稳定后再做，最终视觉精修最后做。

## P6 — Production Readiness

- [ ] Linux systemd/Nginx 自动化部署。
- [ ] 正式域名、TLS、Cloudflare 和 proxy 验收。
- [ ] secrets 管理与 Cookie security。
- [x] PostgreSQL 备份、恢复演练和迁移 rollback/forward-fix 运行手册。
- [x] readiness health、request id、结构化未捕获错误和基础安全 headers。
- [x] 可配置最小 rate limit 与 CSRF origin check。
- [x] structured request logging 与 metrics smoke endpoint。
- [ ] external metrics store、log aggregation 和 alerts。
- [ ] rate limit、CSRF 生产策略细化与多实例方案。
- [ ] 数据保留、账户删除和隐私规则。
- [ ] 小范围真实用户试用与问题回收。

## Explicitly Deferred

- 微服务拆分。
- 复杂消息队列。
- AI 错因分析。
- 在线多人监考。
- 在 override/ownership 设计完成前直接编辑原始题目。
- 在两个前端出现真实复用前创建共享 UI package。
