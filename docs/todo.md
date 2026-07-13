# Roadmap

路线图按依赖和风险排序，不再继续使用已失真的 Phase 3B/3C/3D 清单。

后端完成度、未达成目标与下一步执行计划详见
[`backend-completeness-plan.md`](./backend-completeness-plan.md)。

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
- [ ] 决定正式身份策略：用户名自动创建、密码、学校账号或邀请码。
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
- [ ] 错题掌握规则与再练反馈。
- [ ] 题目收藏/存疑长期化是否需要独立模型。
- [x] 基础学习统计后端：练习次数、正确率、错题摘要。
- [x] 最近使用题库后端，不先做复杂算法。
- [x] 周期趋势和 activity streak 后端 API。
- [ ] 学习统计前端展示。
- [ ] 学习目标。
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
- [ ] PostgreSQL 备份、恢复和迁移回滚方案。
- [ ] structured logging、metrics、health、alerts。
- [ ] rate limit、CSRF 策略、安全 headers。
- [ ] 数据保留、账户删除和隐私规则。
- [ ] 小范围真实用户试用与问题回收。

## Explicitly Deferred

- 微服务拆分。
- 复杂消息队列。
- AI 错因分析。
- 在线多人监考。
- 在 override/ownership 设计完成前直接编辑原始题目。
- 在两个前端出现真实复用前创建共享 UI package。
