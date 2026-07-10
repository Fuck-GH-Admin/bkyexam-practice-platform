# Testing Strategy

状态日期：**2026-07-11**

测试按失败定位和外部依赖分层。任何一层通过都不能替代其他层。

## Repository Quality Gate

安装依赖后执行：

```sh
npm run verify
```

该命令依次运行：

1. `npm run test`：shared、API、Web 的 Vitest 测试。
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

当前 271 个 Vitest 测试覆盖：

- shared schema 与类型约束。
- 题库解析、映射、导入辅助逻辑。
- identity、catalog、practice、wrongbook 的 repository 行为。
- Fastify route 的输入、输出和错误映射。
- Web 练习 model 与关键状态转换。
- Practice/Wrongbook v1 schema 的计数不变量、`false`、legacy UUID 和 strict response boundary。

其中 shared 8 项、API 235 项、Web 28 项。Practice/Wrongbook route 还会故意注入不合法 repository payload，确认 runtime schema 不会把错误数据伪装成 `200`。

多数 API 测试使用 fake/in-memory dependency，因此反馈快，但不证明 SQL、migration 或真实 PostgreSQL 行为。

### Deterministic Browser Smoke

`tests/e2e/` 在浏览器层拦截 `/api/*`，使用带状态的 mock practice API。它验证：

- 服务端草稿语义在刷新后可恢复。
- 当前题号与存疑状态可恢复。
- 单选、多选、判断题和 `false` 答案不会因前端序列化丢失。
- 提交前未答/存疑统计正确。
- 整卷提交后只读结果数量和正确数正确。
- 错题列表及详情不泄漏原始 option UUID。
- Web 对 Practice/Wrongbook mock response 使用与生产相同的 shared Zod runtime parser。
- 移动 viewport 的练习台与提交弹窗没有横向溢出。
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
3. 对空的 `bkyexam_test` 执行全部 migration。
4. 装载只含可见/隐藏题库、父子分类和客观题的最小 fixture。
5. 运行真实 PostgreSQL repository + Fastify API integration test。
6. 无论成功或失败都停止并删除临时容器。

当前 integration spec 验证：

- PostgreSQL migration 可落到空数据库。
- 登录、Cookie session、题库可见性和递归客观题计数。
- 创建练习、题目锁定、草稿、`false`、存疑和当前位置持久化。
- 整卷提交、部分作答计数、正确/错误判分和未答题不生成 attempt。
- completed session 写保护。
- 错题归集、详情参考答案规范化、掌握筛选和错题再练。
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
