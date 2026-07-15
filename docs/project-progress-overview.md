# BKYExam 当前进度总览

状态日期：**2026-07-16**

关联状态页：

- [`status.md`](status.md)：当前已被代码、测试或真实环境证明的能力。
- [`backend-completeness-plan.md`](backend-completeness-plan.md)：后端完成度、未达成目标与后续执行计划。
- [`todo.md`](todo.md)：阶段完成记录。
- [`testing.md`](testing.md)：测试矩阵与验收证据。

## 1. 一句话判断

BKYExam 已经不是“原型”阶段，而是进入了 **内部试用 + 管理运营 MVP + 生产前加固** 阶段。

当前最准确的定位是：

> **学生客观题练习主链路已经可用；后端主功能已基本成型；管理平台具备账号、题库、导入、质检、审计的最小运营能力；真实服务器 staging 已验证过；但完整产品还缺最终前端体验、完整管理工作流、非客观题、实时导入进度、外部监控与正式生产发布验收。**

## 2. 分层完成度

| 层级 | 当前判断 | 估算完成度 | 说明 |
| --- | --- | ---: | --- |
| 学生客观题核心闭环 | 内部可用 | **约 95%** | 登录、首页、多会话、题库、练习、草稿、提交、结果、历史、错题、错题再练已经可用；Learning 后端已具备概览/趋势/目标/长期复习标记；缺 Learning 前端与最终 UX。 |
| 后端主功能 | 基本成型 | **约 88–89%** | Auth、Practice、Wrongbook、Learning、Admin Auth/RBAC/Audit、Admin Users、Student Manage、Bank Mappings、Import Jobs、Question Review、System Status 等主干都已落地；缺非客观题、推荐策略、外部监控、实时 progress、部分完整运营流。 |
| 后端工程化/可验证性 | 稳定 | **约 93%** | `verify:docker`、PostgreSQL integration、Playwright、production gate、backup/restore drill、staging evidence 均已建立；缺持续性能压测、更多异常 fixture、外部告警。 |
| 后端模块化 | 正在改善 | **约 55–60%** | Practice、Import Jobs、Learning repository 已拆分；剩余 Admin questionReview/adminStudents/bankMappings、routes validation/error mapping 等仍偏大。 |
| 管理平台功能 | Operational MVP | **约 70–75%** | Admin Login、System Status、Student Accounts、Bank Mappings、Import Jobs、Question Review、Audit Logs、Admin Users 已有功能页；缺最终视觉、完整 dashboard、Question Review diff/审批/回滚、Import realtime progress、复杂安全策略 UI。 |
| 学生前端 | 可试用但未最终设计 | **约 60–70%** | 练习台、提交检查、历史、错题、临时密码改密最小 UI 已通过 smoke；缺 Learning 正式页面、信息架构打磨、视觉系统、完整移动端体验。 |
| 公开生产就绪 | 接近但未最终发布 | **约 93–94%** | 真实服务器 staging、HTTPS smoke、production gate、旧账号迁移、正式 2 班账号初始化、healthcheck、restore drill、deployment evidence 已完成；缺外部监控告警、持续压测、PR human approval/merge、正式生产发布验收。 |
| 完整产品愿景 | 主体完成但未收口 | **约 90%** | 分母包含最终学生端、Learning 前端、管理平台完整工作流、全题型、运营能力和正式生产发布，所以仍不能称为完整产品。 |

这些百分比是工程判断，用来辅助排优先级，不等于测试覆盖率。

## 3. 已完成的主干能力

### 3.1 学生侧

已完成：

- 学生登录、会话 cookie、退出。
- 临时密码账号强制改密最小 UI。
- 题库列表与搜索/筛选基础字段。
- 多 active practice session。
- 练习 session 创建、草稿保存、断点续答。
- 整卷提交、结果页、历史结果。
- 错题记录、错题详情、错题再练。
- Practice/Wrongbook 读取 Question Review override 后的 effective 内容。
- Learning 后端：
  - dashboard
  - trends
  - goals
  - feedback signals
  - review marks / favorite / long-term review

仍未完成：

- Learning 正式前端页面。
- 学生首页/学习页的最终信息架构和视觉。
- 更完整的移动端体验打磨。
- 非客观题、主观题、批改、附件/图片/富文本题等完整题型链路。

### 3.2 管理侧

已完成：

- Admin Auth / RBAC / Audit foundation。
- 管理员登录失败锁定。
- super_admin bootstrap CLI。
- Admin Users 管理：
  - list/detail/create/update
  - role/status
  - password reset
  - last super admin guard
- Student Accounts 管理：
  - list/detail/create
  - bulk create
  - update
  - reset password
  - revoke sessions
  - className/groupName 字段
- Bank Mappings：
  - list/detail/edit
  - status/visible publish guard
  - bulk status
  - audit
- Import Jobs：
  - dry-run
  - history/detail
  - error report
  - true import gate
  - resetBeforeImport
  - cancel/retry
  - durable worker
  - heartbeat
  - stuck recovery
- Question Review：
  - list/filter
  - flags
  - exclusion from practice
  - full detail
  - override layer
  - optimistic concurrency
  - audit
- Audit Logs read-only UI。
- System Status UI。

仍未完成：

- Admin dashboard / ops summary。
- Question Review diff、审批、回滚、批量操作。
- Import Jobs SSE/WebSocket 实时 progress 事件流。
- Admin 全局最终视觉与交互体系。
- 更复杂的安全策略 UI，例如 MFA/SSO/邀请通知。
- Admin 侧大文件进一步模块化。

### 3.3 导入与题库

已完成：

- 真实题库解析。
- PostgreSQL schema 与 migration。
- 全量导入、事务、幂等 upsert。
- bank mappings 自动生成。
- dry-run summary。
- true import 写入 gate。
- reset import 事务策略。
- cancel/retry。
- durable queued worker。
- heartbeat/stuck recovery。

仍未完成：

- 实时 progress 推送。
- 外部队列服务接入；目前内置 worker 已足够当前规模。
- 导入 UI 的更细粒度日志/阶段图。
- 题库运营质量指标 dashboard。

### 3.4 生产与运维

已完成：

- readiness / health。
- request id。
- security headers。
- rate limit。
- CSRF origin check。
- structured request log。
- metrics smoke endpoint。
- production gate CLI。
- deployment evidence CLI。
- legacy student password migration CLI/runbook。
- backup/restore drill。
- 服务器 staging 部署与 HTTPS smoke。
- synthetic healthcheck timer。
- staging load baseline。

仍未完成：

- 外部监控告警接入。
- 持续性能压测。
- 正式生产发布验收。
- PR human approval / merge。
- 正式事故 runbook 与告警联系人。

## 4. 当前验证基线

最近完整验证：

```text
npm run verify:docker  PASS
```

测试矩阵：

| Workspace | Test files | Tests |
| --- | ---: | ---: |
| `packages/shared` | 2 | 26 |
| `apps/api` | 58 | 443 |
| `apps/web` | 2 | 33 |
| `apps/admin` | 1 | 11 |
| **Total** | **63** | **513** |

Playwright smoke：

```text
5 passed
```

PostgreSQL docker integration：

```text
1 file / 1 test passed
```

真实服务器 staging 已有证据：

```text
target = https://exam.acgbot.cc.cd
production gate = ok=true
legacyPasswordlessStudents = 0
HTTP smoke = PASS
deployment evidence = ready=true
```

## 5. 当前最大缺口

按影响排序：

### P0：Admin 后端继续模块化

原因：现在后端功能越来越多，如果不继续拆，后续维护 Question Review、Student Manage、Bank Mappings 会越来越容易互相污染。

优先拆：

1. `apps/api/src/admin/questionReview.ts`
2. `apps/api/src/admin/adminStudents.ts`
3. `apps/api/src/admin/bankMappings.ts`
4. route validation / error mapping helpers

### P1：Question Review 完整运营流

当前 override 已能编辑，但还不是完整质检平台。

缺：

- override diff
- 审批/发布状态
- 回滚
- 批量操作
- 更清晰的质检责任链

### P1：Import Jobs 实时进度

当前 worker 已稳定，但 UI 只能轮询/查看结果。

缺：

- SSE 或 WebSocket progress stream
- 阶段化 progress event
- 导入过程中更细粒度的可观测性

### P2：Learning 前端与学生信息架构

Learning 后端已具备，但学生端还没有完整学习中心。

缺：

- `/learning` 页面
- dashboard/trends/goals/review marks UI
- 学习反馈文案
- 与练习/错题入口的 IA 打磨

### P2：正式生产运维闭环

缺：

- 外部告警
- 持续压测
- 正式发布 checklist
- PR human approval/merge
- 生产事故 runbook

### P3：最终视觉系统

目前前端可以继续做功能性页面，但不建议现在投入大量视觉打磨。

原因：

- 后端边界仍在拆。
- 管理平台工作流仍在补。
- Learning 前端信息架构还没最终定。
- 过早做视觉会再次遇到“设计途中反推后端改动”的问题。

## 6. 关于前端时机的判断

目前不建议进入最终前端设计阶段。

更合理的策略：

1. **现在只做低成本功能 UI / wireframe / 信息架构验证。**
2. **继续优先稳定后端边界与管理工作流。**
3. **等 Admin Question Review、Student Manage、Bank Mappings 的后端边界更清晰后，再集中设计 Admin 前端。**
4. **等 Learning 前端范围明确后，再集中设计学生端学习中心。**
5. **最终视觉系统放最后统一打磨。**

换句话说：  
**前端不是不做，而是不要现在做最终视觉；现在适合做功能闭环和 IA 验证。**

## 7. 推荐下一阶段路线

### 推荐 B9.31：Admin Question Review 后端模块化

目标：不改行为，只拆文件。

建议拆成：

```text
apps/api/src/admin/question-review/index.ts
apps/api/src/admin/question-review/types.ts
apps/api/src/admin/question-review/repository.ts
apps/api/src/admin/question-review/flags.ts
apps/api/src/admin/question-review/overrides.ts
apps/api/src/admin/question-review/effectiveQuestion.ts
apps/api/src/admin/question-review/mappers.ts
```

验收：

- public import path 保持兼容。
- Question Review tests 不变或只做 import 调整。
- `npm run verify:docker` 通过。
- 文档更新。

### 备选 B9.31：Import Jobs realtime progress

如果当前最想提升管理端导入体验，可以先做：

- progress event model
- SSE endpoint
- worker progress emit
- admin UI 轮询改实时或半实时

但它会比纯模块化更容易改行为，所以风险略高。

### 不建议作为下一阶段

- 大规模视觉重做。
- 管理平台最终 dashboard。
- 非客观题完整链路。
- 外部队列服务。

这些都可以做，但现在不是最高性价比。

## 8. 当前决策点

我们现在需要决定下一步走哪条：

1. **稳健路线：继续 Admin 后端模块化。**  
   推荐，风险最低，有利于后续长期维护。

2. **体验路线：补 Import Jobs realtime progress。**  
   对管理端体验提升明显，但会引入新行为和新测试面。

3. **产品路线：开始 Learning 前端 IA / wireframe。**  
   可以做，但不要做最终视觉。

我的建议是：  
**先做 B9.31 Admin Question Review 后端模块化，然后再考虑 Import realtime progress 或 Question Review 完整运营流。**
