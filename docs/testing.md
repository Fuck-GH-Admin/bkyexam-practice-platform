# Testing Strategy

状态日期：**2026-07-17**

测试按失败定位和外部依赖分层。任何一层通过都不能替代其他层。

## Repository Quality Gate

安装依赖后执行：

```sh
npm run docs:audit
npm run verify
```

`docs:audit` 在不启动服务的情况下检查本地 Markdown 链接、`.env.example` 与 runtime config、Fastify route 与 `docs/api.md` heading、SQL migration 与 `docs/database.md`。它是文档结构一致性门，不替代 Vitest、Playwright、PostgreSQL integration 或真实 staging smoke。

该命令依次运行：

1. `npm run test`：shared、API、Web、Admin 的 Vitest 测试。
2. `npm run typecheck`：全部 workspace 与 Playwright spec 的 TypeScript 检查。
3. `npm run build`：全部 workspace 的生产构建。
4. `npm run test:e2e`：桌面与移动端 Playwright smoke。

`npm run verify` 故意不自动启动数据库，保证日常快速反馈稳定。需要同时验证已有专用测试数据库时：

```sh
npm run verify:db
```

其中 `TEST_DATABASE_URL` 必须已经指向名称明确以 `test` 开头或结尾的 PostgreSQL 测试数据库。

本地安装 Docker 后，完整运行默认质量门与隔离 PostgreSQL profile：

```sh
npm run verify:docker
```

需要缩短反馈时间时，可以分别执行：

```sh
npm run test
npm run typecheck
npm run build
npm run test:e2e:desktop
npm run test:e2e:mobile
```

## Browser Setup

Windows 本地开发默认使用系统已安装的 Chrome，不要求额外下载浏览器。

CI、Linux/macOS，或希望在 Windows 强制使用 Playwright bundled Chromium 时：

```sh
npm run test:e2e:install
```

Windows 强制 bundled Chromium：

```powershell
$env:PLAYWRIGHT_USE_BUNDLED_BROWSER="true"
npm run test:e2e
```

失败产物写入：

- `test-results/playwright/`：trace、截图和视频。
- `playwright-report/`：HTML 报告。

这些目录不会提交到 Git。

## Current Test Layers

### Unit And In-Process Route Tests

当前 Vitest 测试覆盖：

- shared schema 与类型约束。
- 题库解析、映射、导入辅助逻辑。
- identity、student identity security model、password login enforcement、catalog、practice、wrongbook、learning dashboard/trends/goals/review-marks 的 repository 行为；B9.30 已把 Learning repository 拆成 facade/types/memory/pg/utils，测试计数不变。
- Fastify route 的输入、输出和错误映射。
- 临时密码 session 对 Practice/Wrongbook/Learning 的服务端 `PASSWORD_CHANGE_REQUIRED` 门禁，以及 Auth/Catalog 允许访问边界。
- readiness、request id、结构化未捕获错误、安全 headers、可配置 rate limit/CSRF origin check、HTTP metrics smoke endpoint、production gate CLI/env/student migration summary、legacy student password migration CLI、管理员登录失败锁定。
- Web 练习 model 与关键状态转换。
- Admin route、RBAC nav、student query、bulk-create parser、Bank Mapping query/status badge、Import Job query/status badge/realtime event contract、Question Review query/status badge、Question Review revision/diff/approval/reject/rollback contract、Audit Log query/status badge、Admin User query/badge 与状态 helper。
- 学生端 URL parser/builder。
- Practice/Wrongbook/Learning/Auth/Admin Auth/Admin User/Admin Student/Admin Bank Mapping/Admin System Status/Admin Import Job/Admin Question Review/Admin Audit Log v1 schema 的计数不变量、学习统计边界、学习目标/复习标记边界、学生身份字段边界、密码登录/改密边界、写入版本边界、导入任务 summary/error/cancel/retry/worker heartbeat/stuck recovery/realtime event boundary、true import gate/reset boundary、管理员账号边界、题目质检 flag/exclusion/override/revision approval boundary、审计查询 boundary、`false`、legacy UUID、角色/权限和 strict response boundary。
- session card/page contract 的来源、timestamp、计数和分页边界。

截至 2026-07-17，shared 26 项、API 463 项、Web 33 项、Admin 11 项，共 533 项。Practice/Wrongbook/Learning/Admin/Auth route 还会故意注入不合法 repository payload，确认 runtime schema 不会把错误数据伪装成 `200`。

B9.30 局部验证额外覆盖：`npm run typecheck -w @bkyexam-practice/api` 与 `npm run test -w @bkyexam-practice/api -- tests/learning/repository.test.ts tests/routes/learning.test.ts`；阶段最终 `npm run verify:docker` 已通过。

B9.31 局部验证额外覆盖：`npm run typecheck -w @bkyexam-practice/api` 与 `npm run test -w @bkyexam-practice/api -- tests/admin/questionReview.test.ts tests/routes/adminQuestionReview.test.ts`；阶段最终 `npm run verify:docker` 已通过。

B9.32 局部验证额外覆盖：`npm run typecheck -w @bkyexam-practice/api` 与 `npm run test -w @bkyexam-practice/api -- tests/admin/adminStudents.test.ts tests/routes/adminStudents.test.ts`；阶段最终 `npm run verify:docker` 已通过。

B9.33 局部验证额外覆盖：`npm run typecheck -w @bkyexam-practice/api` 与 `npm run test -w @bkyexam-practice/api -- tests/admin/bankMappings.test.ts tests/routes/adminBankMappings.test.ts`；阶段最终 `npm run verify:docker` 已通过。

多数 API 测试使用 fake/in-memory dependency，因此反馈快，但不证明 SQL、migration 或真实 PostgreSQL 行为。

### Deterministic Browser Smoke

`tests/e2e/` 在浏览器层拦截 `/api/*`，使用带状态的 mock practice/admin API。它验证：

- 服务端草稿语义在刷新后可恢复。
- 首页同时展示多个 active session，不再自动选择第一条。
- `/practice/:sessionId` 刷新后直接恢复同一练习。
- 浏览器 back/forward 可在首页和已选练习之间恢复。
- 历史列表进入同一份 completed 结果详情。
- 当前题号与存疑状态可恢复。
- 单选、多选、判断题和 `false` 答案不会因前端序列化丢失。
- 提交前未答/存疑统计正确。
- 整卷提交后只读结果数量和正确数正确。
- 错题列表及详情不泄漏原始 option UUID。
- 临时密码账号会被强制进入 `/account/password`，改密成功后回到原练习 URL。
- Web 对 Practice/Wrongbook mock response 使用与生产相同的 shared Zod runtime parser。
- 移动 viewport 的练习台与提交弹窗没有横向溢出。
- Admin Login、System Status、Student Accounts list/detail/update/reset-password/revoke-sessions/create/bulk-create，以及 Bank Mappings list/detail/edit/bulk-status、Import Jobs list/create dry-run/import/reset/detail/error-report/cancel/retry/worker heartbeat/realtime detail、Question Review list/detail/draft/diff/submit/approve/rollback/add flag/resolve/exclude、Audit Logs list/detail preview、Admin Users list/detail/update/reset-password/create 可以在独立 `apps/admin` 中跑通。
- 关键流程没有未预期的 console error 或 page error。

这层不启动 Fastify，也不连接 PostgreSQL，适合成为每次提交都运行的稳定浏览器回归门。

### Real PostgreSQL Verification

仓库现在提供独立的 PostgreSQL integration profile：

```sh
npm run test:integration:db:docker
```

该命令会：

1. 通过 Compose 在 `127.0.0.1:55432` 启动临时 `postgres:16-alpine`。
2. 等待数据库 healthcheck。
3. 对空的 `bkyexam_test` 执行全部十六份 migration。
4. 装载只含可见/隐藏题库、父子分类和客观题的最小 fixture。
5. 运行真实 PostgreSQL repository + Fastify API integration test。
6. 无论成功或失败都停止并删除临时容器。

当前 integration spec 验证：

- PostgreSQL migration 可落到空数据库。
- 无密码默认失败、学生密码登录、学生改密、Cookie session、学生身份安全字段、题库可见性和递归客观题计数。
- DB-aware readiness health 与 metrics smoke。
- Admin Auth/RBAC/session/audit foundation、管理员登录失败锁定字段、Admin bootstrap、Admin Audit Log read、Admin User manage、Admin Student Manage list/detail/create/bulk-create/update/reset-password/revoke-session/audit、Admin Bank Mapping list/detail/update/bulk-status、Admin System Status、Admin Import Jobs dry-run/import/reset create/list/detail/error-report/cancel/retry/audit/status summary、true import write/idempotency/failed rollback/reset success、worker queue/heartbeat/stuck recovery/durable events、Admin Question Review detail/draft/diff/submit/approve/rollback/flag/exclusion/status summary、version conflict、audit log，且 `bky_admin_session` 与 `bky_session` 隔离。
- importer 真实 SQL：首次插入有 logical writes、相同数据重复导入为零写入、修改 classification/question/option 后能正确更新。
- `question_overrides` / `question_option_overrides` 会在 Practice/Wrongbook/Learning 读取链路中以 effective 内容生效。
- `excludedFromPractice=true` 的 open quality flag 会从新的 Practice bank session 自动选题中排除对应题目。
- 创建练习、题目锁定、草稿、`false`、存疑和当前位置持久化。
- 多 active session、最近活动排序、answered/review summary 与分页 contract。
- 整卷提交、部分作答计数、正确/错误判分和未答题不生成 attempt。
- completed 历史列表与既有结果详情复用。
- completed session 写保护。
- 错题归集、详情参考答案规范化、掌握筛选和 `origin=wrongbook` 再练。
- 学习概览 dashboard：active/completed/review session 数、attempt 正确率、最近题库、题型统计和错题掌握摘要。
- 学习趋势 trends：7 日 UTC 日期桶、session/attempt/wrongbook touch 汇总、正确率和 activity streak。
- 学习目标 goals：默认/学生自定义目标、今日/近 7 日进度、错题复习反馈信号和持久化 upsert。
- 学习复习标记 review-marks：题目收藏/长期复习标记 upsert、列表过滤、学生隔离、持久化和删除。
- 不同学生之间的 session 与错题所有权隔离。
- 退出后服务端 session 失效。
- 真实 PostgreSQL repository 返回值能够通过 Fastify v1 response contract。

如已有外部专用测试数据库，可直接执行：

```powershell
$env:TEST_DATABASE_URL="postgres://user:password@127.0.0.1:5432/bkyexam_test"
npm run test:integration:db
```

测试启动时会 `TRUNCATE` 目标数据库的业务表。安全门只接受名称为 `test`、以 `test_`/`test-` 开头或以 `_test`/`-test` 结尾的数据库，避免误清理开发或生产数据。

`.github/workflows/quality.yml` 已定义两个并行 job：

- unit/typecheck/build/Playwright quality gate。
- 带 PostgreSQL 16 service container 的 database integration。

### Backup / Restore Drill

隔离 backup/restore 演练：

```sh
npm run ops:backup-restore:docker
```

该命令会启动同一个 `postgres-test` service，执行全部 migration，写入覆盖核心业务表的最小 fixture，使用容器内 `pg_dump --format=custom` 导出 backup，生成并验证 SHA-256 sidecar，再用 `pg_restore` 恢复到 `bkyexam_restore_test` 并比较关键表计数。

当前演练覆盖：

- schema 可被 `pg_dump` 导出并恢复。
- persisted dump 的 SHA-256 与 sidecar 一致，并生成 `report.json`。
- 题库、学生、题目、选项、attempt、wrongbook、learning goals、question bookmarks 的最小数据可恢复。
- 恢复库关键表及 `schema_migrations` 计数与源库一致。

backup 文件写入 `artifacts/ops/backup-restore-drill/`，该目录不提交 Git。

### Full Corpus Slow Smoke

完整真实题库可通过可选慢速 profile 重复验证：

```powershell
npm run smoke:import:full:docker -- C:\path\to\BKYExam\Monitor\questionbank
```

该 profile：

1. 启动同一个隔离 `bkyexam_test` PostgreSQL service。
2. 执行 migration 并清空测试数据库。
3. 按 `currentCorpusBaseline.ts` 校验源文件解析计数和各题型分布。
4. 执行第一次全量事务导入并核对数据库计数。
5. 对相同数据执行第二次全量 upsert。
6. 确认第二次导入计数与数据库行数均未变化。
7. 自动删除临时数据库容器。

2026-07-16 本地 Docker profile 最新实测：

- 解析：2941 classifications、89922 questions、180323 raw options。
- 入库：154899 options，跳过 25424 orphan options，生成 2662 bank mappings。
- 两次导入后数据库计数完全一致。
- 解析约 1.34 秒，第一次导入约 21.62 秒，第二次导入约 14.86 秒，总计约 38.20 秒。

本地 Docker 当时可用约 12 CPU / 15.6 GiB memory，Windows host 为 12 logical CPU / 31.9 GiB memory / NVMe SSD。该结果证明完整数据正确性、事务和幂等性，不代表 2 vCPU / 1.6 GiB / 共享云盘 staging 的连续导入容量。

### B9.34 Current-HEAD Staging Evidence

2026-07-16 真实服务器验证：

- commit `c8b310e950c6c31faa7f8e45c8f6bd9d435eceb5`；
- migration `0012/0013`；
- `/` 学生端与 `/admin/` 独立 Admin；
- production gate `ok=true`；
- reset maintenance gate 返回 422 且表计数不变；
- 非 reset true import 成功且保留 practice/attempt/wrongbook；
- worker heartbeat、cancel/retry、stale recovery；
- 最终 31 MiB dump 隔离恢复，所有跟踪表计数一致；
- deployment evidence `ready=true / 14 pass / 0 warn / 0 fail`；
- 重启后轻量 baseline 4 checks / 0 failures。

连续全量 import 后的失败诊断：

- 无 OOM；
- 公网网卡约 1 KiB/s，不是网络跑满；
- 2 vCPU 主机 load average 96.28；
- 20 个 blocked tasks；
- CPU iowait 60.44%；
- 磁盘读约 111597 KiB/s，queue depth 92.64。

因此全量 import 是维护窗口操作，不能与在线负载测试叠加。详细证据见 [`b9.34-current-head-staging-rebaseline.md`](b9.34-current-head-staging-rebaseline.md)。

### B9.35 Security And Operational Truth Evidence

2026-07-16 真实 staging 验证：

```text
runtime commit = 2fbaec15adc976e53945a66e0efdd671d4eb60b7
first migration run = applied 0001..0013 into ledger
second migration run = skipped 0001..0013
schema_migrations = 13 / current 0013 / checksum length 64
production gate = ok, reset gate pass
student activation service guard = PASS
Admin System Status migration truth = PASS
pre/post custom dump checksum = PASS
after monitor = no saturation signals / readinessFailures 0
GitHub Actions push + PR quality/postgres-integration = success
production gate connected-client pg deprecation warning = fixed
```

服务器证据保存在 `/srv/bkyexam-backups/b9.35-20260716T150029Z/`。

该 profile 依赖未提交到 Git 的完整源题库，因此保持手动/定期运行，不进入每次 push 的 CI。源数据合法更新时，应先审查差异，再同步更新 `currentCorpusBaseline.ts` 与状态文档。

### Sustained Import Capacity Profile

完整题库连续非 reset profile：

```powershell
npm run smoke:import:capacity:docker -- C:\path\to\BKYExam\Monitor\questionbank --cycles=3 --batch-size=1000
```

该 profile 在隔离 `bkyexam_test` 中执行一次初始导入和 N 次 unchanged repeat，逐轮断言：

- corpus count 与固定 baseline 一致；
- `writes.classifications/questions/options/bankMappings` 全部为 0；
- 记录 duration、WAL delta、database size、insert/update/dead tuple stats；
- 可通过 `--max-repeat-ms` 和 `--max-repeat-wal-bytes` 设置环境容量阈值。

2026-07-16 完整题库三轮结果：

```text
initial = 24685.58 ms
repeat = 9321.40 / 9406.21 / 9792.22 ms
repeat average = 9506.61 ms
logical writes = 0 / 0 / 0 / 0 in every repeat
WAL = 1177512 / 168 / 244424 bytes
updated tuples = 0
dead tuples = 0
```

日志保存在 `artifacts/ops/b9.38-import-capacity/local-capacity-2026-07-16.log`。

### B9.36–B9.38 Current-HEAD Staging Evidence

2026-07-16 将 runtime commit `da89292e3851001f9a3ac7dd6ad801ca9c2ccf29` 部署到真实 staging 后完成：

```text
service = active/enabled
schema_migrations = 15 / current 0015_import_job_events.sql
second migration run = all skipped
production gate after import = ok=true
Question Review diff/approve/reject/rollback = PASS
Import Jobs SSE/JSON/Last-Event-ID replay = PASS
unchanged non-reset true import = PASS, 11.81 s
WAL delta = 443864 bytes
corpus updates/dead tuples = 0
before/during/after readiness failures = 0
write/reset gates after window = false/false
pre/post custom dump checksum = PASS
```

维护窗口峰值为：

```text
load1 = 0.36
CPU iowait = 15.12%
disk utilization = 36.88%
disk queue = 4
readiness latency = 68.61 ms
```

窗口后 iowait 降至 0.8%、磁盘利用率降至 1.84%，没有饱和信号。服务器证据保存在 `/srv/bkyexam-backups/b9.36-20260716T182355Z/`，完整说明见 [`b9.36-b9.38-workflow-realtime-capacity.md`](b9.36-b9.38-workflow-realtime-capacity.md)。

### B9.39 Workflow And Realtime Coverage Closure

2026-07-17 针对人工核查发现的薄弱分支补充以下自动化覆盖：

- Question Review `pending_review -> rejected` 正向流转。
- reject 不改变 effective override，且 rejected 后可以创建新 draft。
- Admin Playwright 覆盖驳回 UI、驳回后重新提交审批，以及回滚到较旧 approved revision。
- draft version conflict、effective version conflict、missing revision。
- rollback 当前相同 effective snapshot 返回 409，不产生冗余 approved history。
- rollback 到旧 revision 后可继续保存、提交并审批新 revision。
- Question Review workflow 的 403/404/409 尝试写入 `result=failure` 审计。
- Import Jobs SSE 响应头、event framing 和终态自动关闭。
- `Last-Event-ID` replay，并固定 header 优先于 query cursor。
- `cancelled` 与 stale-job `recovered` 事件通过 SSE 送达。
- dry-run 只包含 `loading_source/dry_run_summary/done`；import 模式覆盖写入批次阶段。
- Admin EventSource 生命周期依赖 active/terminal 布尔状态，避免 queued -> running 时无意义重建连接。

完整 `npm run verify:docker` 结果：

```text
docs audit = 56 Markdown / 187 links / 64 routes / 15 migrations
Vitest = 64 files / 530 tests
typecheck = PASS
build = PASS
Playwright = 5 passed
PostgreSQL integration = 1 file / 2 tests passed
```

完整真实题库的验证链包括：

- migration。
- 完整题库导入。
- `db:smoke`。
- PostgreSQL repository + Fastify API 全练习闭环。
- Vite + Fastify + PostgreSQL 的真实 Chrome smoke。

### B9.40 Backend Final Closure

2026-07-17 Backend Final Closure 增加：

- disabled Admin 在密码验证前返回 `403`，且错误密码不会增加失败次数；
- `import_job:create/cancel/retry` 独立权限 contract、RBAC、route 和 Admin UI；
- worker 在 job 被外部标记为 `failed` 后 cooperative abort；
- migration `0016_import_job_index_cleanup.sql` 删除冗余 running-only unique index；
- PostgreSQL System Status 期望 migration count `16`、current `0016_import_job_index_cleanup.sql`。

完整结果：

```text
docs audit = 59 Markdown / 200 links / 64 routes / 16 migrations
Vitest = 64 files / 533 tests
typecheck = PASS
build = PASS
Playwright = 5 passed
PostgreSQL integration = 1 file / 2 tests passed
```

远端和真实服务器结果：

```text
PR #5 required checks = quality / postgres-integration PASS
runtime commit = 6a441a3718367fc5c1576c63f24d4c21ae7d216c
schema_migrations = 16 / current 0016_import_job_index_cleanup.sql
second migration run = all skipped
production gate = ok=true
health/readiness = PASS
student/admin static entry = 200/200
no-auth load baseline = 12 checks / 0 failures
```

服务器证据目录：`/srv/bkyexam-backups/b9.40-20260717T144606Z/`。

最小 fixture integration 已固化为每次 CI 可运行的快速门；完整 89922 题导入已固化为可选慢速 profile，但不会加入每次提交的 CI。

## Change Acceptance

涉及 practice、wrongbook、session 或 answer codec 的变更，至少应满足：

1. 对应 Vitest 回归用例已新增或更新。
2. `npm run typecheck` 通过。
3. `npm run build` 通过。
4. 关键学生流程变化已被 Playwright 覆盖。
5. 涉及 SQL、migration 或 repository wiring 时，必须运行真实 PostgreSQL integration profile。
