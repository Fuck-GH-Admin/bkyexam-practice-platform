# BKYExam Practice Platform

BKYExam 是一个基于现有题库导出数据构建的练习平台。目前已经形成可真实运行的“学生客观题练习闭环”，不再只是 Phase 1 脚手架。

截至 **2026-07-14**，已实现并验证：

- 将 BKYExam 原始题库导入 PostgreSQL，并自动生成学生可见题库映射。
- 基于固定用户名的学生身份、服务端 Cookie 会话、退出与会话恢复。
- 题库浏览、搜索、筛选，以及随机/顺序创建练习会话。
- 单选题、多选题、判断题的分区练习。
- 服务端草稿、断点续答、当前位置、标记存疑。
- 提交前检查、整卷提交、服务端判分和只读结果回看。
- 错题自动归集、错题详情、标记掌握和错题再练。
- 学习概览 API：练习次数、正确率、最近题库、题型统计和错题掌握摘要。
- 独立学生首页、多个进行中练习、练习历史和可恢复页面 URL。
- Practice/Wrongbook/Learning/Auth/Catalog/Admin v1 共享 Zod contract，并在关键 API 输出与 Web/API 输入侧运行时校验。
- Admin Auth/RBAC/session/audit foundation，包括独立 `bky_admin_session`、`/api/admin/auth/*`、Admin Bank Mapping read/write API、Admin System Status API、Import Jobs dry-run/Error Report API、受 `ADMIN_IMPORT_ENABLE_WRITE=true` 保护的 true import mode、Question Review Flags API、Audit Log read API、Admin User manage API 和 `super_admin` bootstrap CLI。
- 桌面与移动端的基础响应式练习体验。

尚未完成的主要产品范围：

- 完整管理平台、管理端 UI，以及 import reset/异步队列/取消重试等完整导入运营能力。
- 正式学生账户、档案、学习目标/推荐策略和 active session 归档。
- 填空、简答、编程、Office 操作等非客观题流程。
- 生产级身份策略、监控、备份、远端 CI 首次验收和正式部署验收。

当前完整度、验证证据和风险见 [系统状态](docs/status.md)，产品边界与目录目标见 [产品与模块边界](docs/product-boundaries.md)。

## Workspace

```text
apps/
  api/       Fastify API、PostgreSQL repository、导入任务
  web/       React/Vite 学生端
packages/
  shared/    跨端共享 schema、versioned API contract 与类型
docs/        当前架构、API、数据库、状态与路线图
```

当前采用 **modular monolith（模块化单体）**，不计划在此阶段拆微服务。现有代码仍有若干大文件，后续按业务垂直切片渐进拆分，禁止一次性“大重构”。

## Requirements

- Node.js `>= 24`
- npm
- PostgreSQL（真实数据与持久化练习必需）
- 可选：Docker Compose，用于本地 PostgreSQL

## Install And Verify

从本目录执行：

```sh
npm ci
npm run test
npm run typecheck
npm run build
npm run test:e2e
```

根脚本会覆盖 `apps/api`、`apps/web` 和 `packages/shared` 全部 workspace；Playwright smoke 会启动 Vite，并使用确定性的 mock API 验证桌面与移动端关键练习流程。

shared package 的运行时入口位于构建产物中；`npm ci` 的 `prepare` 以及根级 dev/test/typecheck/build/E2E 脚本都会先执行 `npm run build:shared`。

Windows 本地默认复用已安装的 Chrome。CI 或未安装 Chrome 的环境先执行：

```sh
npm run test:e2e:install
npm run test:e2e
```

也可以用一条命令执行不依赖外部数据库的默认仓库质量门：

```sh
npm run verify
```

真实 PostgreSQL integration profile 使用独立临时数据库，不会接触开发数据库。安装 Docker 后执行：

```sh
npm run test:integration:db:docker
```

本地安装 Docker 后，一条命令执行默认质量门与隔离数据库 integration：

```sh
npm run verify:docker
```

测试分层、覆盖范围、外部数据库模式与 CI 质量门见 [测试策略](docs/testing.md)。

## Run With PostgreSQL

可使用仓库内的本地开发数据库：

```sh
docker compose up -d postgres
```

配置环境变量。`.env.example` 只是模板，应用目前不会自动读取 `.env`：

```text
DATABASE_URL=postgres://bkyexam:bkyexam@127.0.0.1:5432/bkyexam_practice
USE_DATABASE=true
COOKIE_SECRET=replace-with-a-long-random-secret
COOKIE_SECURE=false
SESSION_TTL_DAYS=30
ADMIN_SESSION_TTL_HOURS=8
ADMIN_IMPORT_ALLOWED_ROOTS=C:\path\to\questionbank
ADMIN_IMPORT_ENABLE_WRITE=false
```

PowerShell 示例：

```powershell
$env:DATABASE_URL="postgres://bkyexam:bkyexam@127.0.0.1:5432/bkyexam_practice"
$env:USE_DATABASE="true"
$env:COOKIE_SECRET="local-development-secret"
$env:ADMIN_IMPORT_ALLOWED_ROOTS="C:\path\to\questionbank"
$env:ADMIN_IMPORT_ENABLE_WRITE="false" # 改为 true 后允许 /api/admin/import-jobs mode=import 写入；resetBeforeImport 仍关闭
```

初始化数据库：

```sh
npm run db:migrate -w @bkyexam-practice/api
npm run import:db -w @bkyexam-practice/api -- <questionbank-dir>
npm run db:smoke -w @bkyexam-practice/api
```

创建第一个管理端 `super_admin`：

```powershell
$env:ADMIN_BOOTSTRAP_LOGIN_NAME="root@example.com"
$env:ADMIN_BOOTSTRAP_DISPLAY_NAME="Root Admin"
$env:ADMIN_BOOTSTRAP_PASSWORD="<8+ chars password>"
npm run admin:bootstrap
```

该命令只在还没有 `super_admin` 时成功；不会开放 public registration，也不会输出明文密码。

如需对一个已经存在的专用测试数据库直接运行 integration profile，数据库名必须为 `test`，或以 `test_`/`test-` 开头，或以 `_test`/`-test` 结尾：

```powershell
$env:TEST_DATABASE_URL="postgres://bkyexam:bkyexam@127.0.0.1:5432/bkyexam_test"
npm run test:integration:db
```

分别启动 API 和学生端：

```sh
npm run dev
npm run dev:web
```

- API：`http://127.0.0.1:3000`
- Web：`http://127.0.0.1:5173`
- Health：`http://127.0.0.1:3000/api/health`

`USE_DATABASE=false` 只适合轻量本地启动和 route 单元测试。真实题库、持久化学生会话、草稿和错题本需要 `USE_DATABASE=true`。

## Source Data

题库导出目录通常位于主仓库的 `Monitor/questionbank/`，也可以通过命令行传入任意绝对路径。导入器只读取源 `.txt` 文件，不会修改原始题库。

可选的全量慢速 smoke 会启动隔离 PostgreSQL、执行 migration、按已记录基线校验 89922 题、连续导入两次验证幂等性，再核对数据库计数：

```powershell
npm run smoke:import:full:docker -- C:\path\to\BKYExam\Monitor\questionbank
```

该 profile 依赖本地完整题库，不进入每次提交的 CI；当前 Docker 环境完整运行约需数分钟。

## Documentation

当前有效文档：

- [系统状态与完整度](docs/status.md)
- [产品与模块边界](docs/product-boundaries.md)
- [学生信息架构 v1](docs/student-information-architecture.md)
- [架构](docs/architecture.md)
- [后端完成度与下一步计划](docs/backend-completeness-plan.md)
- [Admin 后端 Contract 设计](docs/admin-backend-contract.md)
- [Admin Console IA Gate](docs/admin-console-ia.md)
- [版本化 API Contract](docs/contracts.md)
- [API](docs/api.md)
- [数据库](docs/database.md)
- [测试策略](docs/testing.md)
- [导入器](docs/importer.md)
- [题库映射](docs/mapping.md)
- [部署](docs/deployment.md)
- [路线图](docs/todo.md)

`docs/superpowers/` 与部分 `docs/design/` 文件是历史设计/实施记录，用来解释决策来源；如与上述当前文档或代码冲突，以当前文档和已验证代码为准。
