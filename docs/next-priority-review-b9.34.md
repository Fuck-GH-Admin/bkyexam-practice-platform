# B9.34 Next Priority Review

状态日期：**2026-07-16**

执行状态：**已完成。** 本文保留为 B9.34 启动时的优先级决策记录；实际部署、reset 数据风险、I/O 饱和诊断、最终 restore 和发布结论见 [`b9.34-current-head-staging-rebaseline.md`](b9.34-current-head-staging-rebaseline.md)。

## 1. 决策结论

经过对当前代码、测试、文档和真实服务器的重新核对，原先的两个候选：

1. route validation / error mapping helpers 收敛；
2. Import Jobs realtime progress；

都不是当前全局最优的下一步。

新的推荐是：

> **B9.34：Current-HEAD Staging Re-baseline / 当前分支预发布重新验收。**

先冻结当前功能范围，把本地已经完成的 B9.17–B9.33 作为一个 release candidate 部署到真实 staging，完成数据库迁移、学生端、独立管理端、Import worker 和主要运营链路的组合验收，再决定下一项产品或重构工作。

## 2. 为什么需要修正原建议

### 2.1 本地验证是新的，真实环境证据是旧的

审计时的本地功能实现基线：

```text
branch = codex/practice-platform-stabilization
implementation baseline = e3f453b refactor: split admin bank mappings module
verify:docker = PASS
```

真实服务器在 2026-07-16 通过 SSH 核对：

```text
repo = /srv/bkyexam-practice-platform
branch = codex/practice-platform-stabilization
commit = 1686c6e27a23029c6cc53c8a22ddb843c3d332d7
worktree = clean
latest migration = 0011_admin_identity_security.sql
```

该功能实现基线比服务器领先 **22 个提交**；本决策文档之后产生的 docs-only commit 不改变功能差异。服务器缺少：

- migration `0012_question_review_overrides.sql`；
- migration `0013_import_job_worker.sql`；
- 学生首次改密与账号启用 UI；
- 独立 `apps/admin`；
- Student Accounts、Bank Mappings、Import Jobs、Question Review、Audit Logs、Admin Users 功能页面；
- Question Review override 持久化；
- Import true write/reset/cancel/retry；
- Import durable worker、heartbeat、stuck recovery；
- B9.29–B9.33 的后端模块化结果。

因此，B9.14/B9.15 的真实服务器证据只能证明 commit `1686c6e`，不能证明当前 HEAD。

### 2.2 当前 `/admin` 不是新管理平台

2026-07-16 HTTP 核对结果：

```text
GET /       -> 200, assets/index-9CEFB64M.js
GET /admin  -> 200, assets/index-9CEFB64M.js
```

两个入口返回相同旧资源。当前独立 Admin 构建并没有部署到 `/admin`。这意味着：

- 管理端 Nginx/static routing 尚未在真实环境验证；
- Admin 浏览器登录、权限和各运营页面尚未在真实环境验证；
- 本地 Playwright 通过不能替代目标服务器验证。

### 2.3 新增的 worker 和 migration 是部署级变化

Import Jobs realtime progress 建立在 durable worker 已正确部署的前提上。当前服务器甚至还没有：

- `worker_id` / `heartbeat_at` schema；
- migration `0013`；
- 当前 worker runtime；
- 对应环境变量与重启恢复验证。

在 worker 本身尚未经过真实环境验证前继续叠加 SSE/WebSocket，会扩大未验证面。

### 2.4 route helpers 的收益真实但不紧急

当前 route 层存在重复：

- `safeParse` 多处出现；
- schema parse 和参数错误响应重复；
- `not_found`、`permission`、`version_conflict` 等映射分散。

这属于明确的维护性债务，但：

- 当前 route tests 和完整验证已通过；
- 它不会直接补齐产品工作流；
- 它不会发现 Nginx、systemd、migration、worker、静态资源和真实数据兼容问题；
- 在 release candidate 尚未部署前继续重构，会让待验收 diff 更大。

所以它应保留，但从下一项 P0 下调为 release candidate 验收后的工程化任务。

## 3. 候选方案比较

评分：1 最低，5 最高。风险降低和信息价值越高越优；实现风险越低越优。

| 候选 | 用户/运营价值 | 发布风险降低 | 环境信息价值 | 实现风险 | 当前优先级 |
| --- | ---: | ---: | ---: | ---: | --- |
| Current-HEAD staging re-baseline | 4 | 5 | 5 | 3 | **P0** |
| Import Jobs realtime progress | 3 | 1 | 2 | 3 | P2，按运营反馈触发 |
| route validation/error helpers | 1 | 2 | 1 | 4 | P2/P3，稳定后收敛 |
| Question Review diff/审批/回滚 | 4 | 2 | 3 | 2 | P1，需先真实试用现有 override |
| Learning 前端 IA/功能页 | 4 | 1 | 3 | 3 | P1，需用户审查后启动 |
| 最终视觉系统 | 3 | 1 | 1 | 2 | P3，继续后置 |

## 4. B9.34 推荐执行范围

### 4.1 范围冻结与证据基线

- 冻结 B9.17–B9.33 的功能范围。
- 记录待部署 commit。
- 确认 worktree clean。
- 运行并保存：
  - `npm run verify:docker`
  - `npm run ops:backup-restore:docker`
- 不在本阶段新增 realtime progress、route helper 重构或新产品功能。

### 4.2 部署前备份与回滚点

- 备份当前服务器代码、环境文件、Nginx 配置和 systemd unit。
- 对当前 PostgreSQL 做部署前备份。
- 记录当前 commit `1686c6e` 和回滚命令。
- 确认回滚时旧代码对新增 nullable schema 的兼容性。

### 4.3 更新服务器代码与数据库

- 更新服务器到本阶段最终 commit。
- `npm ci`。
- 构建 shared、API、学生 Web 和 Admin。
- 执行 migration `0012`、`0013`。
- 验证 schema、index、migration history。
- 在目标数据库运行 production gate。

### 4.4 修正真实部署形态

目标形态：

```text
/            -> apps/web/dist
/admin       -> apps/admin/dist
/admin/*     -> apps/admin/dist/index.html
/api/*       -> Fastify
```

需要明确验证：

- `/admin` 不再返回学生端旧 bundle；
- Admin history fallback 正常；
- student/admin 静态资源缓存不会互相污染；
- API cookie、CSRF origin 和 HTTPS 行为正确；
- systemd 启动环境包含 Import worker 配置。

### 4.5 真实环境功能 smoke

学生侧：

- 正式学生账号登录；
- 临时密码强制改密；
- `/api/auth/me`；
- 题库列表；
- 创建 practice session；
- 保存草稿；
- 提交与结果；
- 历史和错题再练。

管理侧：

- Admin 登录与 `/api/admin/auth/me`；
- System Status；
- Student Accounts list/detail/create/bulk-create/update/reset-password/revoke-sessions；
- Bank Mappings list/detail/update/bulk-status；
- Import Jobs dry-run；
- true import 的受控最小样本验证；
- reset/cancel/retry；
- detail/error report；
- Question Review detail/flag/exclusion/override；
- Audit Logs；
- Admin Users。

### 4.6 Import worker 专项

- queued job 被 worker claim；
- `workerId` 与 `heartbeatAt` 更新；
- cancel checkpoint 生效；
- retry 可重新排队；
- API/systemd 重启后 queued job 继续执行；
- 人工构造 stale running job，确认 recovery；
- worker disabled 时行为符合配置；
- 日志中没有重复执行或并发 active job。

### 4.7 运维证据刷新

- health/readiness/metrics；
- synthetic healthcheck；
- staging load baseline；
- migration 后 backup/restore drill；
- journal/Nginx error log；
- deployment evidence JSON；
- 当前 commit、当前 migration 和资源 hash；
- 更新状态文档，区分“本地已验证”和“当前 HEAD 已在 staging 验证”。

## 5. B9.34 完成标准

以下全部满足才算完成：

1. 服务器 commit 与计划部署 commit 一致。
2. 服务器 migration 到 `0013`。
3. `/` 和 `/admin` 分别服务学生端与管理端。
4. API、Nginx、PostgreSQL 和 systemd 状态正常。
5. production gate `ok=true`。
6. 学生和 Admin 核心 smoke 通过。
7. Import worker 的 claim/heartbeat/restart/stuck recovery 通过。
8. migration 后 backup/restore drill 通过。
9. staging load baseline 无回归。
10. 部署证据和项目状态文档已更新。

## 6. B9.34 之后如何选择

完成真实环境验收后，不预设一定做 route helpers 或 realtime progress，而是按证据选择：

### 如果导入操作暴露出进度不可见问题

做 Import Jobs realtime progress：

- 先定义 progress event model；
- 优先 SSE，不先引入 WebSocket；
- 保留轮询降级；
- 用真实大题库导入验证断线重连和最终一致性。

### 如果真实验收暴露 route 错误不一致

做 route validation / error mapping helpers：

- 先固定统一错误 contract；
- 一次迁移一个 route family；
- 每次保持 public behavior；
- 避免全仓一次性替换。

### 如果现有功能稳定但运营流程不足

优先 Question Review：

- override diff；
- draft/approved/published 状态；
- 审批权限；
- rollback；
- 批量操作。

### 如果用户审查认为学生学习闭环更重要

进入 Learning 前端 IA 和功能性实现，但仍不做最终视觉系统。

## 7. 修正后的全局排序

### P0

1. B9.34 Current-HEAD staging re-baseline。
2. 修复 staging 暴露的问题。
3. 当前 release candidate 的人工管理端/学生端验收。

### P1

4. 最小外部告警目标和发布 runbook 收口。
5. Question Review 完整运营流，或 Learning 前端 IA；由真实试用反馈决定顺序。

### P2

6. Import Jobs realtime progress，按真实导入体验触发。
7. route validation/error mapping helpers，按缺陷和维护压力触发。

### P3

8. 非客观题大范围扩展。
9. 最终视觉系统。

## 8. 最终判断

route helpers 和 realtime progress 都值得做，但现在继续做其中任何一个，都会扩大“本地已完成、真实环境未证明”的差距。

当前最高价值不是再增加一个能力，而是：

> **证明我们最近完成的 22 个提交、2 个新 migration、独立 Admin 前端和 durable Import worker 能在真实服务器上作为一个整体稳定运行。**
