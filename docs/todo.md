# Roadmap

## Completed B9.40 Backend Final Closure — 2026-07-17

- [x] Admin disabled 状态在密码验证前返回，不再验证禁用账号密码或累计失败次数。
- [x] Import Jobs 拆分 `import_job:create`、`import_job:cancel`、`import_job:retry` 权限。
- [x] Admin UI 按独立 cancel/retry permission 控制操作按钮。
- [x] Import worker `shouldAbort` 直接识别 `failed` 与 `cancelled`。
- [x] 新增 `0016_import_job_index_cleanup.sql`，删除冗余 `import_jobs_one_running_kind_idx`。
- [x] Drizzle schema 只保留 queued/running active-job unique index。
- [x] 新增 disabled/no-failure-state、worker external failure、权限守卫和 migration 测试。
- [x] 新增 [`backend-final-closure.md`](backend-final-closure.md)。
- [x] 新增学生端和管理端信息架构/功能流程文档及 Mermaid 图。
- [x] `docs:audit`：59 Markdown / 200 links / 64 routes / 16 migrations。
- [x] Vitest：64 files / 533 tests；Playwright：5 passed；PostgreSQL integration：2 passed。
- [x] PR #5 的 `quality` 与 `postgres-integration` required checks 通过并完成合并。
- [x] runtime commit `6a441a3` 已部署，`0016` 首次 applied、二次全部 skipped。
- [x] production gate、health/readiness、Nginx、学生/Admin 静态入口和 12 项 no-auth load baseline 通过。
- [x] 部署证据写入 `/srv/bkyexam-backups/b9.40-20260717T144606Z/`。

## Completed B9.39 Workflow and realtime test coverage closure — 2026-07-17

- [x] 补 Question Review reject 正向流：pending -> rejected、effective 不变、reject 后重新编辑。
- [x] Admin Playwright 覆盖驳回 UI、驳回后重新提交审批和非冗余历史回滚。
- [x] 补 draft/effective version conflict、missing revision 和 403/404/409 failure audit。
- [x] 禁止 rollback 到当前相同 effective snapshot，避免冗余 approved history。
- [x] 覆盖 rollback 到旧 revision 后继续保存、提交和审批。
- [x] PostgreSQL integration 覆盖 reject 不写 effective 表和 no-op rollback 409。
- [x] 补 Import Jobs SSE framing、no-buffer header、`Last-Event-ID` replay。
- [x] 补 cancelled/recovered SSE 终态事件。
- [x] 自动断言 dry-run 三阶段与 import 写入批次阶段。
- [x] Admin EventSource 改为按 active/terminal 布尔状态管理，避免 queued -> running 重连抖动。
- [x] 修正 API JSON/cursor/阶段文档，并在 deployment 文档显式配置 `proxy_buffering off`。
- [x] `npm run verify:docker` 通过：64 files / 530 Vitest、5 Playwright、2 PostgreSQL integration。

## Completed B9.36–B9.38 Question Review workflow, Import realtime progress, and importer capacity — 2026-07-16

- [x] 新增 `0014_question_review_workflow.sql` 与 `question_override_revisions`。
- [x] Question Review 支持 draft、字段级 diff、submit、approve、reject 和 rollback。
- [x] 新增 `question_review:approve` 权限；content editor 与审批者职责分离。
- [x] approved revision 才写入 effective override；draft/pending/rejected 不影响学生读取。
- [x] 回滚创建新的 approved revision，不删除历史。
- [x] 新增 `0015_import_job_events.sql` 与 durable event stream。
- [x] 新增 `GET /api/admin/import-jobs/:jobId/events` JSON/SSE 双模式。
- [x] 支持 `Last-Event-ID`/`afterEventId` 断线补拉、keepalive 和 Nginx no-buffer。
- [x] importer/worker 报告 classifications/questions/options/bank_mappings 批次进度。
- [x] Admin Import Jobs detail 显示实时进度条和事件历史。
- [x] importer 对 unchanged incoming row 先做 `NOT EXISTS` prefilter，并保留 conflict race guard。
- [x] importer 返回实际 logical write counts。
- [x] PostgreSQL integration 验证首次插入、unchanged 零写入和 changed row 更新。
- [x] 完整题库三轮 non-reset capacity profile 通过：repeat 平均约 9.51 秒，logical writes=0，updated/dead tuples=0。
- [x] Admin Playwright 覆盖 Question Review 保存草稿、diff、提交、审批和回滚。
- [x] runtime commit `da89292` 已部署到真实服务器，migration ledger 为 15、current `0015_import_job_events.sql`。
- [x] 真实 Question Review diff/approve/reject/rollback 与 Import Jobs SSE/JSON/Last-Event-ID 功能验证通过。
- [x] 受控维护窗口 non-reset true import 通过：11.81 秒、WAL 443,864 bytes、corpus updates/dead tuples=0、readiness failures=0。
- [x] 测试后 `ADMIN_IMPORT_ENABLE_WRITE=false`、`ADMIN_IMPORT_ENABLE_RESET=false`，pre/post custom dump checksum 均通过。
- [x] GitHub Actions push/PR 的 quality 与 PostgreSQL integration 均通过；PR #2 仍等待 human review。
- [x] 详细说明见 [`b9.36-b9.38-workflow-realtime-capacity.md`](b9.36-b9.38-workflow-realtime-capacity.md)。

## Completed B9.35 Security and operational truth closure — 2026-07-16

- [x] 首次改密从前端跳转升级为 Practice/Wrongbook/Learning 服务端门禁。
- [x] shared error contract 增加 `PASSWORD_CHANGE_REQUIRED`。
- [x] production gate 把 `ADMIN_IMPORT_ENABLE_RESET=true` 作为 blocking failure。
- [x] migration runner 增加 `schema_migrations` ledger、SHA-256 drift 与 missing-file detection。
- [x] Admin System Status 改为读取数据库真实 migration count/current。
- [x] backup/restore drill 统一为 custom dump、SHA-256 sidecar、`pg_restore` 和 `report.json`。
- [x] 新增 Linux import maintenance before/during/after 资源监控脚本。
- [x] Admin Import Jobs 移除开发机本地 sourceDir 默认值。
- [x] 文档明确 Learning 是后端 MVP+，学生 Web 尚未交付。
- [x] 完整质量门、Git/CI 和真实服务器部署证据已补录；staging runtime commit 为 `2fbaec1`。

详细说明见 [`b9.35-security-operational-truth-closure.md`](b9.35-security-operational-truth-closure.md)。

## Completed B9.34 Current-HEAD staging re-baseline — 2026-07-16

- [x] 全局复核 route helpers、Import realtime progress 与其他候选优先级。
- [x] 通过 SSH 确认服务器仍是 commit `1686c6e`、migration `0011`、worktree clean。
- [x] 确认本地功能实现基线 `e3f453b` 已领先服务器 22 个提交，并新增 migration `0012/0013`。
- [x] 确认线上 `/` 与 `/admin` 返回相同旧 bundle，独立 Admin 尚未部署。
- [x] 新增 [`next-priority-review-b9.34.md`](next-priority-review-b9.34.md)，修正下一阶段排序。
- [x] 冻结并部署 commit `c8b310e950c6c31faa7f8e45c8f6bd9d435eceb5`。
- [x] 部署前备份代码、env、Nginx、systemd 和 PostgreSQL。
- [x] 更新服务器代码并执行 migration `0012/0013`。
- [x] 构建并分别部署学生 Web 与独立 Admin app。
- [x] 验证 production gate、学生/Admin 主链路和 Import worker。
- [x] 执行 reset true import，发现 corpus reset 级联删除学习数据后立即从部署前 dump 恢复。
- [x] 新增 `ADMIN_IMPORT_ENABLE_RESET=false` 独立维护门禁，并验证 reset 422 不改变数据。
- [x] 验证非 reset true import 成功且保留 practice/attempt/wrongbook 数据。
- [x] 完成最终隔离 backup/restore、轻量 load baseline、日志和 deployment evidence。
- [x] 确认连续全量 import 后的挂起主因是 2 vCPU 主机块设备 I/O 饱和，不是公网网络或 OOM。
- [x] 本地完整题库 Docker 双次幂等导入通过。
- [x] 刷新 deployment evidence、status、testing 和部署日志。
- [x] 本阶段未做 route helper 重构、realtime progress 或最终视觉。

详细证据见 [`b9.34-current-head-staging-rebaseline.md`](b9.34-current-head-staging-rebaseline.md)。

## Completed B9.33 Admin Bank Mappings backend modularization — 2026-07-16

- [x] 新增 `docs/backend-modularization-b9.33-bank-mappings.md`。
- [x] 将 `apps/api/src/admin/bankMappings.ts` 收敛为兼容 facade。
- [x] 拆出 `admin/bank-mappings/{index,types,memoryRepository,pgRepository,mappers,rules}.ts`。
- [x] 保持 Bank Mappings list/detail/update/bulk-status public API 与 SQL 行为不变。
- [x] 通过 API typecheck、Bank Mappings repository/routes 局部测试与最终 `npm run verify:docker`。
- [x] 不做 route validation/error helper 抽取、不做 Import realtime progress、不做最终前端视觉。

## Completed B9.32 Admin Students backend modularization — 2026-07-16

- [x] 新增 `docs/backend-modularization-b9.32-admin-students.md`。
- [x] 将 `apps/api/src/admin/adminStudents.ts` 收敛为兼容 facade。
- [x] 拆出 `admin/admin-students/{index,types,service,memoryRepository,pgRepository,mappers,utils}.ts`。
- [x] 保持 Student Accounts list/detail/create/bulk-create/update/reset-password/revoke-session public API 与 SQL 行为不变。
- [x] 通过 API typecheck、Admin Students repository/routes 局部测试与最终 `npm run verify:docker`。
- [x] 不做 Bank Mappings 拆分、不做 Import realtime progress、不做最终前端视觉。

## Completed B9.31 Admin Question Review backend modularization — 2026-07-16

- [x] 新增 `docs/backend-modularization-b9.31-question-review.md`。
- [x] 将 `apps/api/src/admin/questionReview.ts` 收敛为兼容 facade。
- [x] 拆出 `admin/question-review/{index,types,memoryRepository,pgRepository,mappers}.ts`。
- [x] 保持 Question Review list/detail/flag/exclusion/override public API 与 SQL 行为不变。
- [x] 通过 API typecheck、Question Review repository/routes 局部测试与最终 `npm run verify:docker`。
- [x] 不做 diff/审批/回滚/批量操作、不做 Import realtime progress、不做最终前端视觉。

## Completed B9.30 Learning backend modularization — 2026-07-16

- [x] 新增 `docs/backend-modularization-b9.30-learning.md`。
- [x] 将 `apps/api/src/learning/repository.ts` 收敛为兼容 facade。
- [x] 拆出 `types.ts`、`memoryRepository.ts`、`pgRepository.ts`、`utils.ts`。
- [x] 保持 Learning Dashboard / Trends / Goals / Review Marks public API 与 SQL 行为不变。
- [x] 通过 API typecheck、Learning repository/routes 局部测试与最终 `npm run verify:docker`。
- [x] 不做 Admin 更大文件拆分、不做实时 progress 事件流、不做最终前端视觉。

路线图按依赖和风险排序，不再继续使用已失真的 Phase 3B/3C/3D 清单。

后端完成度、未达成目标与下一步执行计划详见
[`backend-completeness-plan.md`](./backend-completeness-plan.md)。

## Completed B9.29 Backend modularization follow-up — 2026-07-16

- [x] 新增 `docs/backend-modularization-b9.29.md`。
- [x] 将 `apps/api/src/admin/import-jobs/repository.ts` 收敛为 facade。
- [x] 新增 `memoryRepository.ts`，承载 Import Jobs in-memory repository。
- [x] 新增 `pgRepository.ts`，承载 Import Jobs PostgreSQL repository 与 queue/claim/heartbeat/recover SQL。
- [x] 新增 `jobMapper.ts`，承载 row mapping 与 clone helper。
- [x] 保留 `apps/api/src/admin/importJobs.ts` 兼容 facade。
- [x] 不改行为、不改 public API、不拆更大范围 Learning/Admin 大文件。

## Completed B9.28 Import Jobs durable worker / heartbeat / stuck recovery — 2026-07-16

- [x] 新增 `docs/import-jobs-durable-worker.md`。
- [x] 新增 migration `0013_import_job_worker.sql`，为 `import_jobs` 增加 `worker_id` 与 `heartbeat_at`。
- [x] 新增 `import_jobs_worker_scan_idx` 与 `import_jobs_one_active_kind_idx`。
- [x] shared `AdminImportJobV1` 增加可选 `workerId` / `heartbeatAt`。
- [x] repository 支持 `createQueuedImportJob`、`claimNextImportJob`、`heartbeatImportJob`、`recoverStaleImportJobs`。
- [x] 新增 `createAdminImportJobWorker`，支持 background start/stop、runOnce、heartbeat 和 stale recovery。
- [x] 生产 `index.ts` 在 `USE_DATABASE=true` 且 `ADMIN_IMPORT_WORKER_ENABLED=true` 时启用 queued execution。
- [x] `apps/admin` Import Job detail 显示 workerId / heartbeatAt。
- [x] 扩展 API route/service/repository/schema/migration tests。
- [x] 不做外部队列服务、不做 SSE/WebSocket 实时 progress、不做最终视觉。

## Completed B9.27 Import Jobs control and backend modularization — 2026-07-16

- [x] 新增 `docs/import-jobs-control-and-backend-modularization.md`。
- [x] `mode=import` 下允许 `super_admin` 使用 `resetBeforeImport=true`。
- [x] reset import 在同一事务中执行 `TRUNCATE classifications CASCADE` 后重导；失败或 cancel 会 rollback。
- [x] 新增 `POST /api/admin/import-jobs/:jobId/cancel`，写入 `import_job.cancel` audit。
- [x] 新增 `POST /api/admin/import-jobs/:jobId/retry`，复制原 job source/options/mode 创建新 job，并写入 `import_job.retry` audit。
- [x] Import runner 新增 cancellation checkpoint；cancelled job 不会被 complete/fail 覆盖。
- [x] `apps/admin` Import Jobs create form 支持 dry_run/import/reset，detail 支持 cancel/retry。
- [x] 拆分 `apps/api/src/admin/importJobs.ts` 为 `admin/import-jobs/{types,repository,service,runner}.ts`，原路径保留 facade。
- [x] 新增 `apps/api/src/import/cancellation.ts`，`importQuestionBank` 支持 `resetBeforeImport` 与 `shouldAbort`。
- [x] 扩展 API service/route/PostgreSQL integration/Admin Playwright smoke。
- [x] B9.27 当时不做 durable queue/worker、heartbeat/stuck recovery、实时 progress 事件流和最终视觉；durable worker/heartbeat/stuck recovery 已在 B9.28 补齐。

## Completed B9.26 Question Review override layer — 2026-07-15

- [x] 新增 `docs/question-review-override-layer.md`。
- [x] 新增 migration `0012_question_review_overrides.sql`。
- [x] 新增 `question_overrides` / `question_option_overrides`，避免直接改导入原表。
- [x] shared Admin v1 contract 新增 full detail、option detail、override request/response。
- [x] 实现 `GET /api/admin/question-review/:questionId`。
- [x] 实现 `PATCH /api/admin/question-review/:questionId/override`，使用 `expectedVersion` optimistic concurrency。
- [x] 写入 `question_review.override_update` audit log。
- [x] Practice/Wrongbook/Learning 读取 effective 题干、答案、解析或选项文案。
- [x] Admin Question Review detail panel 支持编辑题干、answerRaw、analyzeRaw、选项文案和 note。
- [x] 扩展 shared/API/PostgreSQL integration/Admin Playwright smoke。
- [x] 不做富文本/图片题编辑器、不做批量 override、不做 diff/审批/回滚 UI、不做最终视觉。

## Completed Frontend B9.25 Admin Users management UI — 2026-07-15

- [x] 新增 `docs/admin-users-management-ui.md`。
- [x] `/admin/users` 从 placeholder 升级为功能性管理员管理页面。
- [x] 实现 Admin Users list/filter/page，覆盖 keyword、status、role。
- [x] 实现 `/admin/users/:adminId` detail/edit panel，支持 displayName、status、roles 和 password reset。
- [x] 实现 `/admin/users/create` create panel，支持 loginName、displayName、password 和 roles。
- [x] 扩展 Admin unit tests、mock Admin API 和 Playwright smoke。
- [x] 不做 MFA/SSO、不做邀请邮件/通知、不做复杂安全策略 UI、不做最终视觉。

## Completed Frontend B9.24 Admin Audit Logs read-only UI — 2026-07-15

- [x] 新增 `docs/admin-audit-logs-readonly-ui.md`。
- [x] `/admin/audit-logs` 从 placeholder 升级为功能性只读页面。
- [x] 实现 Audit Logs list/filter/page，覆盖 actorAdminId、action、resourceType、resourceId、result、createdFrom、createdTo。
- [x] 实现 `/admin/audit-logs/:auditLogId` preview panel，展示 actor、resource、result、createdAt、before、after 和 metadata。
- [x] 扩展 Admin unit tests、mock Admin API 和 Playwright smoke。
- [x] 不做复杂 diff viewer、不做导出、不做审计统计 dashboard、不做最终视觉。

## Completed Frontend B9.23 Admin Question Review preview UI — 2026-07-15

- [x] 新增 `docs/admin-question-review-preview-ui.md`。
- [x] `/admin/question-review` 从 placeholder 升级为功能性 preview 页面。
- [x] 实现 Question Review list/filter/page，覆盖 status、severity、flagType、questionType、bankId、keyword。
- [x] 实现 `/admin/question-review/:questionId` preview panel，展示 contentPreview、answerPreview、optionCount、flags 和 excludedFromPractice。
- [x] 实现 add flag、resolve flag、ignore flag 和 toggle excludedFromPractice。
- [x] 扩展 Admin unit tests、mock Admin API 和 Playwright smoke。
- [x] 不做完整题目编辑器、不做 override 层、不做批量操作、不做最终视觉。

## Completed Frontend B9.22 Admin Import Jobs dry-run/history UI — 2026-07-15

- [x] 新增 `docs/admin-import-jobs-dry-run-ui.md`。
- [x] `/admin/import-jobs` 从 placeholder 升级为功能性 dry-run/history 页面。
- [x] 实现 Import Jobs list/filter/page，覆盖 status 与 limit/offset。
- [x] 实现 `/admin/import-jobs/create` dry-run 创建表单，固定 `mode=dry_run` 与 `resetBeforeImport=false`。
- [x] 实现 `/admin/import-jobs/:jobId` detail，展示 progress、summary、questionTypes、options 和 lifecycle timestamps。
- [x] 实现 error report panel，调用 `/api/admin/import-jobs/:jobId/errors` 并展示 `errorSummary`。
- [x] 扩展 Admin unit tests、mock Admin API 和 Playwright smoke。
- [x] B9.22 本阶段不做 true import write UI、reset/cancel/retry、异步 queue/worker 和最终视觉；reset/cancel/retry 已在 B9.27 补齐。
## Completed Frontend B9.21 Admin Bank Mappings P1 UI — 2026-07-15

- [x] 新增 `docs/admin-bank-mappings-p1-ui.md`。
- [x] `/admin/bank-mappings` 从 placeholder 升级为功能性 P1 页面。
- [x] 实现 Bank Mappings list/filter/page，覆盖 keyword、status、visible、subjectCategory、subjectName、hasObjectiveQuestions、qGroup。
- [x] 实现 `/admin/bank-mappings/:bankId` detail/edit，支持文案字段、keywords、description/notes、status/visible。
- [x] status/visible 控件按 `bank_mapping:publish` 权限启用；文案字段按 `bank_mapping:write` 权限启用。
- [x] 保存使用 `expectedVersion`，处理 `409` version conflict 和无客观题发布风险提示。
- [x] 实现 bulk status，渲染 `updated[]` / `failed[]` partial result。
- [x] 扩展 Admin unit tests、mock Admin API 和 Playwright smoke。
- [x] B9.21 本阶段不做最终视觉、Import true write/reset/cancel/retry 和完整 Question Review editor；Import reset/cancel/retry 已在 B9.27 补齐。
## Completed Backend B9.20 Admin P1 Workflow UI Review / Backend Gap Check — 2026-07-15

- [x] 新增 `docs/admin-p1-workflow-gap-review.md`。
- [x] 对照 shared v1 Admin Bank Mapping contract，确认 list/detail/edit/bulk-status UI 字段和状态足够支撑 P1。
- [x] 确认 Bank Mappings 是下一阶段最稳的管理端 P1 UI 候选；无阻塞性后端缺口。
- [x] 对照 Import Jobs contract 和 service，确认 B9.20 当时 dry-run/history/error-report UI 可做，但 true import write/reset/cancel/retry 需要先补控制后端；该控制后端已在 B9.27 补齐，durable worker 已在 B9.28 补齐。
- [x] 对照 Question Review contract，确认可先做 preview-level flag/exclusion UI；完整审核器仍缺 full question detail/override 层。
- [x] 明确 Admin dashboard summary 不应塞入 System Status；如需要账号运营统计，后续新增独立 ops summary API。
- [x] 不实现最终视觉，不新增业务代码，不改变 API contract。
## Completed Frontend B9.19 Admin Operational MVP — 2026-07-15

- [x] 创建独立 `apps/admin` workspace，Vite dev server 固定 5174。
- [x] 根脚本新增 `dev:admin`，`npm run build` 纳入 Admin 生产构建。
- [x] 实现 `/admin/login`、Admin session restore、logout、目标路由恢复和 403 fallback。
- [x] 实现 role/permission filtered sidebar；Bank Mappings、Import Jobs、Question Review、Audit Logs、Admin Users 只做 placeholder。
- [x] 实现 `/admin/system`，严格按 shared v1 `AdminSystemStatusResponseV1Schema` 渲染 API/DB/corpus/import/quality 状态。
- [x] 实现 `/admin/students` list/filter/page、detail、单个创建、批量创建、资料更新、重置密码、撤销会话。
- [x] 批量创建支持 JSON 或简单 CSV paste，客户端转换为 contract JSON 后提交，并渲染 created/skipped/failed partial result。
- [x] 所有 Admin API response 写入 React state 前执行 shared v1 schema parse；非 2xx 使用 `ApiErrorResponseV1Schema`。
- [x] 新增 Admin unit tests 和 Admin Playwright smoke；`npm run test:e2e` 现在为 5 passed。
- [x] 新增 `docs/admin-operational-mvp.md`。
- [x] 未实现 Bank Mapping / Import Jobs / Question Review / Audit Logs / Admin Users 完整 UI；未做最终视觉。
## Completed Backend B9.18 Admin Static Wireframe Review — 2026-07-15

- [x] 新增 `docs/admin-static-wireframe-review.md`。
- [x] 固定 Admin Login、Admin Shell、System Status、Student Accounts list/detail/create/bulk-create/reset-password/revoke-sessions 静态 wireframe。
- [x] 固定 operator/content_editor/super_admin 的导航可见性矩阵。
- [x] 固定 Student Accounts 的 empty/error/forbidden/partial-success/locked/passwordResetRequired 状态。
- [x] 明确 B9.19 推荐范围：独立 `apps/admin`、Admin Login、System Status、Student Accounts。
- [x] 明确 Bank Mappings、Import Jobs、Question Review、Audit Logs、Admin Users 在 B9.19 只做 placeholder 或暂缓。
- [x] 未创建正式 `apps/admin`；未实现 Admin UI；未做最终视觉。

## Completed Frontend B9.17 Student Activation Minimum UI — 2026-07-15

- [x] 登录表单已要求密码，并发送 `{ loginName, password }`。
- [x] 新增学生账号入口 `/account/password`。
- [x] `passwordResetRequired=true` 时自动拦截到改密页，阻止进入题库/练习/错题/历史。
- [x] 改密调用 `POST /api/auth/password/change`，成功后刷新 `GET /api/auth/me`。
- [x] 改密成功后回到原目标路由；直接进入改密页时回到首页。
- [x] 用户菜单和账号页展示 loginName、displayName、className、groupName、待改密/已启用状态。
- [x] 单元测试覆盖密码表单校验和身份展示；Playwright 覆盖临时密码账号强制改密后返回原练习 URL。
- [x] 未重做整体学生端视觉；未创建 `apps/admin`；未实现 public 注册/找回。

## Completed Backend B9.16 Pre-Frontend Review Packet — 2026-07-15

- [x] 新增 `docs/frontend-kickoff-review.md`，固定正式前端开工前的学生端/管理端审查范围。
- [x] 明确正式视觉重做继续暂缓；下一步只建议做学生账号启用最小 UI。
- [x] 固定学生端 P0 缺口：首次改密、账号身份显示、改密错误状态、auth gate。
- [x] 固定 Learning 前端 IA 候选：推荐 `/learning` 一级入口，首页只放摘要。
- [x] 固定管理端边界：推荐独立 `apps/admin`，第一版优先 Student Accounts + System Status。
- [x] 更新 `student-information-architecture.md`、`admin-console-ia.md`、`product-boundaries.md` 和 `status.md` 的前端开工前说明。
- [x] 未创建正式 `apps/admin`；未重做学生端视觉；未声明前端已完成。

## Completed Backend B9.15 Staging Operations / PR / Credential / Admin IA — 2026-07-15

- [x] 服务器侧 synthetic healthcheck 已安装：`bkyexam-healthcheck.timer` active/enabled，每 5 分钟检查 `health/readiness/metrics`。
- [x] healthcheck 最新结果 `ok=true`，日志保存在 `/var/log/bkyexam-healthcheck/checks.jsonl`。
- [x] post-deploy backup/restore drill 已在目标服务器通过，关键业务表计数一致。
- [x] 轻量 staging load baseline 已通过：27 checks / 0 failures，覆盖 health/readiness/metrics/banks/student login/me/practice create/admin login/me。
- [x] 新增 `npm run ops:staging-load-baseline` 和 `scripts/run-staging-load-baseline.mjs`，支持无凭据 smoke、凭据 CSV、阈值检查和 JSON 证据输出。
- [x] PR #2 merge 决策记录已写入：CI green，但受 `main` required approving review=1 阻塞，当前不绕过、不合并。
- [x] 凭据交付、首次改密、管理员重置密码和旧账号保留策略已写入 runbook。
- [x] 管理平台 IA 已补 Student Accounts、Account Operations Flow 和权限矩阵；正式前端仍暂缓。
- [x] 证据记录在 `docs/staging-operations-hardening.md`、`docs/pr-review-merge-decision.md`、`docs/credential-delivery-runbook.md`、`docs/admin-console-ia.md` 与服务器 `/srv/bkyexam-backups/b9.15-20260715104214/`。
- [x] 未声明第三方通知目标已接入；未声明 PR 已 review/merge；未声明正式公开生产发布完成。

## Completed Backend B9.14 Staging Deployment Evidence — 2026-07-15

- [x] 真实服务器目标：`https://exam.acgbot.cc.cd` / `root@47.88.33.54`。
- [x] 部署 commit：`1686c6e27a23029c6cc53c8a22ddb843c3d332d7`。
- [x] 恢复首次部署中断：重启后确认 `npm ci` 未完成导致 service 缺依赖，续跑安装/构建/迁移/导入。
- [x] `npm ci`、`npm run build`、`db:migrate`、`import:db`、`db:smoke` 通过。
- [x] 全量题库导入结果：2941 classifications / 89922 questions / 154899 options / 2662 mappings。
- [x] `/etc/bkyexam-practice-api.env` 已启用 production、secure cookie、rate limit、CSRF origin check，true import write 保持关闭。
- [x] 旧 13 个无密码学生账号已保留并迁移到临时密码；`legacyPasswordlessStudents=0`。
- [x] 已创建/刷新 `admin` super_admin。
- [x] 已创建/刷新 `202502040201`–`202502040230`，`className=2班`，`passwordResetRequired=true`。
- [x] 凭据只保存在服务器受限目录 `/root/bkyexam-credentials/LATEST`，未写入 Git，未在对话中输出明文密码。
- [x] 目标数据库 production gate：`ok=true`，仅剩预期的 password reset queue warning。
- [x] HTTPS smoke 覆盖 health/readiness/metrics/banks/student login/auth me/practice create/admin login/admin me，全部 PASS。
- [x] deployment evidence CLI：`ready=true`，`14 pass / 0 warn / 0 fail`。
- [x] API、nginx、PostgreSQL 最终均 active，近 10 分钟 API journal 未见 error/warn/fail。
- [x] 证据记录在 `docs/b9.14-staging-deployment-log.md` 与服务器 `/srv/bkyexam-backups/b9.14-20260715080815/`。
- [x] 未声明 PR 已 review/merge；未声明已接入外部监控告警或完成系统性压测。

## Completed Backend B9.13 PR / Branch Protection / Required Checks — 2026-07-15

- [x] 创建 PR `#2`：`https://github.com/Fuck-GH-Admin/bkyexam-practice-platform/pull/2`。
- [x] B9.13 初次 PR 证据 commit `07a7892b0a6ea5e50fdeb5f4ec60090bdd54dc84` 已触发 pull_request CI。
- [x] PR `Quality` workflow run `29376220149` 通过。
- [x] PR `quality` job 通过。
- [x] PR `postgres-integration` job 通过。
- [x] `main` branch protection 已启用。
- [x] required status checks 已配置：`quality`、`postgres-integration`。
- [x] required approving reviews 已配置为 `1`，dismiss stale reviews、admin enforcement、required conversation resolution 已启用。
- [x] force pushes / deletions 已禁用。
- [x] 后续提交以 PR `#2` 最新 status checks 为准，不要求每次文档提交都改写初次证据快照。
- [x] 未合并 PR，未替代 owner/reviewer 完成 review，未声明公开生产可发布。

后续代码阶段：

- [x] B9.14 Staging Production Gate / Deployment Smoke / Performance Evidence（`exam.acgbot.cc.cd`）已完成：production gate `ok=true`、legacy passwordless `0`、HTTPS smoke PASS、deployment evidence `ready=true`。
- [x] B9.15 Staging Operations Hardening：服务器侧 synthetic monitor/systemd alert hook、systemd/nginx/env runbook 复核、低成本 load baseline、实机 backup/restore drill 已完成；第三方通知目标仍待配置。
- [x] PR #2 review / merge 决策材料已完成：CI green，实际 merge 仍等待 required approving review。
- [x] B9.18 Admin Static Wireframe Review 已完成；下一步建议 B9.19 Admin Operational MVP。

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
- [x] B5.9 当时 `resetBeforeImport=true` 在 import mode 中仍返回 `422`，不做清库重导；B9.27 已允许 `super_admin` reset import。
- [x] B5.9 PostgreSQL integration 覆盖成功写入、幂等、失败回滚/error report 和 reset gate；B9.27 已改为 reset success / destructive corpus reset 覆盖。
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
- [x] 题目质检 full detail 与 override 层。
- [x] 初始 `super_admin` bootstrap。
- [x] Audit Log read API。
- [x] Admin User 管理。
- [x] 真正执行写入的 import mode（受 `ADMIN_IMPORT_ENABLE_WRITE=true` gate 保护）。
- [x] import reset、cancel/retry。
- [x] API 进程内 durable worker/队列、heartbeat 和 stuck job recovery。
- [x] SSE 实时 progress 事件流与阶段级进度细化。

### Frontend

- [x] 创建独立 `apps/admin`。
- [x] 实现管理 shell、导航和权限守卫（B9.19 最小 Admin runtime slice）。
- [x] 实现题库整理表格/详情。
- [x] 实现导入任务状态。
- [x] 实现只读题目质检与异常标记。
- [x] 实现题目质检 override 最小编辑器。
- [x] 实现审计日志只读列表。

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
- 直接编辑导入原始题目表；人工修订应继续走 override 层。
- 在两个前端出现真实复用前创建共享 UI package。
