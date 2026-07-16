# Documentation And Code Consistency Audit

状态日期：**2026-07-16**
审计基线：`5ddbeadb6e7b3d42f70c8fe92df62b9001a0cba2`
目标：确认仓库文档是否足以支持人工核查，并找出文档、真实代码与 staging 之间的割裂。

## 1. 结论

修正本轮发现的漂移后，**当前核心文档已能覆盖代码主链路，适合进入人工核查**。文档不是“所有产品细节都完成”，而是：

- 当前状态、API、migration、配置、部署和测试已有明确真相源；
- 59 个 literal Fastify route 均在 `docs/api.md` 有精确 method/path heading；
- 13 份 SQL migration 均在 `docs/database.md` 有说明；
- runtime config key 已由 `.env.example` 覆盖；
- 本地 Markdown 链接全部可解析；
- 真实 staging HEAD、服务状态、health/readiness、静态学生/Admin 入口和 reset/write gate 已现场复核。

> **B9.35 后续收口：** 本文记录的是修复前审计快照。B9.35 已补 production reset blocking gate、首次改密服务端门禁、migration ledger/checksum、真实 System Status、custom backup checksum/report、导入维护窗口资源监控，并移除 Admin 本地 sourceDir 默认值。当前结论见 [`b9.35-security-operational-truth-closure.md`](b9.35-security-operational-truth-closure.md)。

## 2. 审计方法

### 2.1 本地静态比对

- 遍历 Markdown local links。
- 比对 `apps/api/src/config.ts` 与 `.env.example`。
- 提取 `apps/api/src/routes/*.ts` 中 `app.get/post/put/patch/delete` literal route。
- 要求 `docs/api.md` 存在完全一致的 method/path heading。
- 比对 `apps/api/src/db/migrations/*.sql` 与 `docs/database.md`。
- 检查 package scripts、shared contract、学生首次改密、Admin UI 和 import reset gate 的实现声明。

自动入口：

```sh
npm run docs:audit
```

### 2.2 真实 staging 复核

现场确认：

```text
server repo HEAD = 5ddbeadb6e7b3d42f70c8fe92df62b9001a0cba2
bkyexam-practice-api = active
nginx = active
postgresql = active
GET /api/health = 200, ok=true
GET /api/health/readiness = 200, database.status=ok
GET / = 200
GET /admin/ = 200
ADMIN_IMPORT_ENABLE_WRITE=false
ADMIN_IMPORT_ENABLE_RESET=false
0012 question override tables = present
0013 worker columns/indexes = present
```

注意：正确 readiness 路径是 `/api/health/readiness`，不是 `/api/ready`。

## 3. 本轮发现并修复的割裂

### 3.1 当前状态

| 问题 | 真实情况 | 修复 |
| --- | --- | --- |
| README 仍称服务器停留在 B9.14/`0011` | staging 已部署 `c8b310e` 与 `0012/0013`，服务器仓库 HEAD 为 `5ddbead` | README 改为当前 staging 状态 |
| Admin contract 仍称 UI 未开始 | `apps/admin` Operational MVP 已实现并部署 `/admin/` | 更新 contract 与 architecture |
| 文档缺统一入口，历史阶段与当前状态混在一起 | 目录内既有 current docs，也有 B9.14/B9.20 等时间点快照 | 新增 `docs/README.md`，明确阅读顺序和历史边界 |

### 3.2 API 与 contract

| 问题 | 真实代码 | 修复 |
| --- | --- | --- |
| `docs/api.md` 缺 `GET /api/admin/question-review/:questionId` 独立章节 | route 已实现，返回 effective detail | 补完整 heading、字段语义和错误 |
| `docs/api.md` 缺 `PATCH /api/admin/question-review/:questionId/override` | route、shared schema、audit、409 conflict 均已实现 | 补 request/rules/errors |
| priority 文档写成 `/api/admin/auth/me` | 实际是 `GET /api/admin/me` | 更正路径 |
| contracts 仍称学生 self password change/force-change 未实现 | API 与 Web 首次改密强制页面均已实现 | 更新 remaining debt |

### 3.3 Import 安全语义

多份较早文档只写“reset 需要 `super_admin`”，但当前代码还要求：

```text
ADMIN_IMPORT_ENABLE_WRITE=true
ADMIN_IMPORT_ENABLE_RESET=true
actor role = super_admin
```

本轮已同步 README、API、Admin contract、Admin IA、Product Boundaries 和 Production Gate runbook。文档现在明确：

- routine true import 使用 `resetBeforeImport=false`；
- reset 会通过 `TRUNCATE classifications CASCADE` 删除 corpus，并级联删除依赖学习数据；
- reset gate 默认必须保持 `false`；
- reset 只用于已完成备份校验的维护窗口。

### 3.4 Database、配置和测试数字

- `docs/database.md` 原先缺少 `0013_import_job_worker.sql`，现已补齐。
- `.env.example` 原先缺 `NODE_ENV`，现已补齐。
- `backend-completeness-plan.md` 的旧汇总仍为 513/443，现改为 515 Vitest / 445 API。
- README 的 PostgreSQL 配置示例现包含 `ADMIN_IMPORT_ENABLE_RESET=false`。

## 4. 保留但不算割裂的历史内容

以下内容有意保留：

- B9.14 部署时确实只有 `0001..0011`；
- B9.20 时 reset 确实仍被禁止；
- static wireframe 阶段确实没有创建 `apps/admin`；
- `todo.md` 中的 completed 项记录了阶段执行顺序。

这些是历史证据，不应被全文替换成当前结论。人工核查时应从 `docs/README.md` 进入，并优先看 B9.34/current status。

## 5. 仍未闭合的真实缺口

### 5.1 文档/自动审计能力

- `docs:audit` 只识别 literal Fastify route，不覆盖动态拼接 route。
- 不校验 external URL、JSON example 与 Zod schema 的逐字段同构。
- 测试数量仍是人工维护值；参数化测试使静态 `it()` 计数不能可靠替代 Vitest 实际输出。
- 阶段历史文档仍可能包含当时的“下一步”，必须依赖索引区分时间语境。

### 5.2 代码/运维能力

- production gate 已在 B9.35 检查 `ADMIN_IMPORT_ENABLE_RESET` 并作为 blocking failure。
- migration runner 已在 B9.35 增加 `schema_migrations` ledger 与 checksum/missing-file drift 检测。
- Import Jobs 没有 SSE/WebSocket realtime progress。
- reset 没有 typed destructive confirmation，也没有学习数据保留/版本化设计。
- 外部告警通知目标尚未接入。
- 2 vCPU staging 上连续全量 import 会触发磁盘 I/O 饱和，导入必须维护窗口化并继续优化。

### 5.3 产品范围

- 非客观题流程未完成。
- Question Review diff/审批/回滚未完成。
- Admin 最终视觉和完整 dashboard/ops summary 未完成。
- 推荐策略、完整长期学习档案和正式用户验收未完成。

## 6. 人工核查清单

### 6.1 学生端

- 登录、退出、session 恢复。
- 临时密码账号是否被强制进入首次改密页。
- 题库列表、搜索、筛选。
- random/sequential 创建练习。
- 草稿、当前位置、标记存疑、刷新恢复。
- 整卷提交、结果回看、历史列表。
- 错题归集、详情、掌握、再练。
- Learning dashboard/trends/goals/review marks 后端 API；学生 Web 尚无对应路由、页面和调用。
- 多 active session 和 URL 恢复。

### 6.2 管理端

- Admin login/logout/RBAC。
- System Status 数据口径。
- Student Accounts 单建、批建、编辑、重置密码、撤销 session。
- Bank Mappings detail/edit/bulk status/乐观并发。
- Import Jobs dry-run、history、detail、error report、cancel/retry。
- Question Review list/detail/flag/exclusion/override/version conflict。
- Audit Logs before/after/metadata。
- Admin Users create/update/password/status/roles 与 last-super-admin guard。

### 6.3 运维

- `/api/health` 与 `/api/health/readiness`。
- `/` 与 `/admin/` 静态路由。
- production gate report。
- write/reset gate 均为 `false`。
- backup checksum、隔离 restore、关键表计数。
- 导入维护窗口期间的 load、iowait、磁盘队列和 API latency。

## 7. 建议人工核查后的决策顺序

1. 先记录实际使用中“无法完成”或“语义不清”的工作流，不先讨论配色。
2. 若主要问题来自后台操作反馈，优先做 Import realtime progress 和 destructive confirmation。
3. 若主要问题来自质检协作，优先做 Question Review diff/审批/回滚。
4. 若学生主链路信息架构仍不清晰，再统一设计学生端，而不是继续局部补样式。
5. 前端最终视觉仍放在功能、角色、数据和异常状态确认之后。
