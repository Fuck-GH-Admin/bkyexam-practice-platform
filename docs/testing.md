# Testing Strategy

状态日期：**2026-07-15**

测试按失败定位和外部依赖分层。任何一层通过都不能替代其他层。

## Repository Quality Gate

安装依赖后执行：

```sh
npm run verify
```

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

当前 504 个 Vitest 测试覆盖：

- shared schema 与类型约束。
- 题库解析、映射、导入辅助逻辑。
- identity、student identity security model、password login enforcement、catalog、practice、wrongbook、learning dashboard/trends/goals/review-marks 的 repository 行为。
- Fastify route 的输入、输出和错误映射。
- readiness、request id、结构化未捕获错误、安全 headers、可配置 rate limit/CSRF origin check、HTTP metrics smoke endpoint、production gate CLI/env/student migration summary、legacy student password migration CLI、管理员登录失败锁定。
- Web 练习 model 与关键状态转换。
- Admin route、RBAC nav、student query、bulk-create parser、Bank Mapping query/status badge、Import Job query/status badge、Question Review query/status badge、Question Review override contract、Audit Log query/status badge、Admin User query/badge 与状态 helper。
- 学生端 URL parser/builder。
- Practice/Wrongbook/Learning/Auth/Admin Auth/Admin User/Admin Student/Admin Bank Mapping/Admin System Status/Admin Import Job/Admin Question Review/Admin Audit Log v1 schema 的计数不变量、学习统计边界、学习目标/复习标记边界、学生身份字段边界、密码登录/改密边界、写入版本边界、导入任务 summary/error boundary、true import gate、管理员账号边界、题目质检 flag/exclusion/override boundary、审计查询 boundary、`false`、legacy UUID、角色/权限和 strict response boundary。
- session card/page contract 的来源、timestamp、计数和分页边界。

其中 shared 26 项、API 434 项、Web 33 项、Admin 11 项。Practice/Wrongbook/Learning/Admin/Auth route 还会故意注入不合法 repository payload，确认 runtime schema 不会把错误数据伪装成 `200`。

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
- Admin Login、System Status、Student Accounts list/detail/update/reset-password/revoke-sessions/create/bulk-create，以及 Bank Mappings list/detail/edit/bulk-status、Import Jobs list/create dry-run/detail/error-report、Question Review list/detail preview/override/add flag/resolve/exclude、Audit Logs list/detail preview、Admin Users list/detail/update/reset-password/create 可以在独立 `apps/admin` 中跑通。
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
3. 对空的 `bkyexam_test` 执行全部十二份 migration。
4. 装载只含可见/隐藏题库、父子分类和客观题的最小 fixture。
5. 运行真实 PostgreSQL repository + Fastify API integration test。
6. 无论成功或失败都停止并删除临时容器。

当前 integration spec 验证：

- PostgreSQL migration 可落到空数据库。
- 无密码默认失败、学生密码登录、学生改密、Cookie session、学生身份安全字段、题库可见性和递归客观题计数。
- DB-aware readiness health 与 metrics smoke。
- Admin Auth/RBAC/session/audit foundation、管理员登录失败锁定字段、Admin bootstrap、Admin Audit Log read、Admin User manage、Admin Student Manage list/detail/create/bulk-create/update/reset-password/revoke-session/audit、Admin Bank Mapping list/detail/update/bulk-status、Admin System Status、Admin Import Jobs dry-run create/list/detail/error-report/audit/status summary、true import write/idempotency/failed rollback/reset gate、Admin Question Review detail/override/flag/exclusion/status summary、version conflict、audit log，且 `bky_admin_session` 与 `bky_session` 隔离。
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

该命令会启动同一个 `postgres-test` service，执行全部 migration，写入覆盖核心业务表的最小 fixture，使用容器内 `pg_dump` 导出 backup，再恢复到 `bkyexam_restore_test` 并比较关键表计数。

当前演练覆盖：

- schema 可被 `pg_dump` 导出并恢复。
- 题库、学生、题目、选项、attempt、wrongbook、learning goals、question bookmarks 的最小数据可恢复。
- 恢复库关键表计数与源库一致。

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

2026-07-10 本地 Docker profile 实测：

- 解析：2941 classifications、89922 questions、180323 raw options。
- 入库：154899 options，跳过 25424 orphan options，生成 2662 bank mappings。
- 两次导入后数据库计数完全一致。
- 解析约 7.1 秒，第一次导入约 91.4 秒，第二次导入约 42.7 秒，总计约 142.1 秒。

该 profile 依赖未提交到 Git 的完整源题库，因此保持手动/定期运行，不进入每次 push 的 CI。源数据合法更新时，应先审查差异，再同步更新 `currentCorpusBaseline.ts` 与状态文档。

完整真实题库的验证链包括：

- migration。
- 完整题库导入。
- `db:smoke`。
- PostgreSQL repository + Fastify API 全练习闭环。
- Vite + Fastify + PostgreSQL 的真实 Chrome smoke。

最小 fixture integration 已固化为每次 CI 可运行的快速门；完整 89922 题导入已固化为可选慢速 profile，但不会加入每次提交的 CI。

## Change Acceptance

涉及 practice、wrongbook、session 或 answer codec 的变更，至少应满足：

1. 对应 Vitest 回归用例已新增或更新。
2. `npm run typecheck` 通过。
3. `npm run build` 通过。
4. 关键学生流程变化已被 Playwright 覆盖。
5. 涉及 SQL、migration 或 repository wiring 时，必须运行真实 PostgreSQL integration profile。
