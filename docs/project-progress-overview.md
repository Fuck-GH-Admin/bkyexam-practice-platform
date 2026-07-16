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

> **学生客观题练习主链路已经可用；后端主功能已基本成型；管理平台具备账号、题库、导入、质检、审计的运营能力；B9.36–B9.38 已补齐 Question Review diff/审批/回滚、Import Jobs durable events/SSE realtime progress，以及 change-aware importer 和完整题库连续容量 profile。Learning 仍是后端能力，学生前端尚未交付。**

文档阅读顺序与本轮代码一致性结果见 [`README.md`](README.md) 和 [`documentation-code-consistency-audit-2026-07-16.md`](documentation-code-consistency-audit-2026-07-16.md)。

## 2. 分层完成度

| 层级 | 当前判断 | 估算完成度 | 说明 |
| --- | --- | ---: | --- |
| 学生客观题核心闭环 | 内部可用 | **约 95%** | 登录、首页、多会话、题库、练习、草稿、提交、结果、历史、错题、错题再练已经可用；Learning 后端已具备概览/趋势/目标/长期复习标记；缺 Learning 前端与最终 UX。 |
| 后端主功能 | 基本成型 | **约 91–92%** | Auth、Practice、Wrongbook、Learning、Admin Auth/RBAC/Audit、Admin Users、Student Manage、Bank Mappings、Import Jobs realtime、Question Review workflow、System Status 等主干都已落地；缺非客观题、推荐策略、外部监控和部分复杂运营流。 |
| 后端工程化/可验证性 | 本地与 current-HEAD staging 已验证 | **约 97%** | 既有质量门、staging evidence、migration ledger/checksum、backup checksum、reset gate、资源 monitor 之上，新增真实 PostgreSQL changed-row 验证和完整题库三轮持续容量 profile；仍缺外部告警和不同硬件档位容量阈值。 |
| 后端模块化 | 正在改善 | **约 66–70%** | Practice、Import Jobs、Learning repository、Admin Question Review、Admin Students、Bank Mappings 已拆分；剩余 routes validation/error mapping、submit service 等仍偏大。 |
| 管理平台功能 | Operational MVP+ | **约 82–85%** | Admin Login、System Status、Student Accounts、Bank Mappings、Import Jobs realtime、Question Review diff/审批/回滚、Audit Logs、Admin Users 已有功能页；缺最终视觉、完整 dashboard、批量质检和复杂安全策略 UI。 |
| 学生前端 | 可试用但未最终设计 | **约 60–70%** | 练习台、提交检查、历史、错题、临时密码改密最小 UI 已通过 smoke；缺 Learning 正式页面、信息架构打磨、视觉系统、完整移动端体验。 |
| 当前 HEAD 公开生产就绪 | staging-ready，尚未正式公开发布 | **约 95–96%** | B9.36–B9.38 current HEAD 已完成真实 staging 部署、Question Review/Import realtime 功能复验、non-reset true import、资源监控和 pre/post checksum；仍需外部告警、PR human approval/merge、正式发布审批和真实用户验收。 |
| 完整产品愿景 | 主体完成但未收口 | **约 91%** | 分母包含最终学生端、Learning 前端、全题型、复杂运营能力和正式生产发布，所以仍不能称为完整产品。 |

这些百分比是工程判断，用来辅助排优先级，不等于测试覆盖率。

## 3. 已完成的主干能力

### 3.1 学生侧

已完成：

- 学生登录、会话 cookie、退出。
- 临时密码账号强制改密最小 UI，以及 Practice/Wrongbook/Learning 服务端强制门禁。
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
  - durable progress events
  - SSE reconnect / realtime progress
- Question Review：
  - list/filter
  - flags
  - exclusion from practice
  - full detail
  - override layer
  - optimistic concurrency
  - field diff
  - draft/submit/approve/reject
  - rollback history
  - audit
- Audit Logs read-only UI。
- System Status UI。
- System Status 的 database migration 摘要读取真实 `schema_migrations` ledger。

仍未完成：

- Admin dashboard / ops summary。
- Question Review 批量操作、审批通知和 source drift 报告。
- Import Jobs 文件/行级错误下载和跨硬件容量阈值。
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
- reset import 事务策略与独立 `ADMIN_IMPORT_ENABLE_RESET` 维护门禁。
- cancel/retry。
- durable queued worker。
- heartbeat/stuck recovery。

仍未完成：

- 外部队列服务接入；目前内置 worker 已足够当前规模。
- 导入 UI 的文件/行级错误日志和更复杂阶段图。
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
- custom dump SHA-256 sidecar/report。
- migration ledger 与 checksum/missing-file drift detection。
- production gate 对 reset gate 的 blocking check。
- 导入维护窗口 before/during/after 资源采样脚本。
- 服务器 staging 部署与 HTTPS smoke。
- synthetic healthcheck timer。
- staging load baseline。
- current-HEAD staging re-baseline。
- 全量 import 后 I/O 饱和诊断。
- 最终 target dump 隔离恢复与 deployment evidence。

仍未完成：

- 外部监控告警接入。
- 多硬件档位持续性能阈值与长期趋势存储。
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
| `apps/api` | 59 | 456 |
| `apps/web` | 2 | 33 |
| `apps/admin` | 1 | 11 |
| **Total** | **64** | **526** |

Playwright smoke：

```text
5 passed
```

PostgreSQL docker integration：

```text
1 file / 2 tests passed
```

真实服务器 staging 已有证据：

```text
target = https://exam.acgbot.cc.cd
runtime commit = da89292e3851001f9a3ac7dd6ad801ca9c2ccf29
production gate = ok=true
legacyPasswordlessStudents = 0
HTTP smoke = PASS
service = active/enabled
migration ledger = 15 / current 0015 / second run all skipped
student activation API guard = PASS
Admin System Status migration truth = PASS
Question Review diff/approve/reject/rollback = PASS
Import Jobs SSE/JSON/replay = PASS
unchanged non-reset true import = PASS, 11.81 s / 443864 WAL bytes
corpus updates/dead tuples = 0
before/during/after readiness failures = 0
write/reset gates after window = false/false
```

## 5. 当前最大缺口

按影响排序：

### P0：公开发布审批与外部可观测性

B9.36–B9.38 已完成 current-HEAD staging 复验。真实验收确认：

- routine true import 使用 `resetBeforeImport=false` 可保留学习数据；
- reset 会级联删除 practice/attempt/wrongbook，现已由第二层维护门禁默认关闭；
- change-aware importer 使 unchanged full import 降到 11.81 秒和 443,864 bytes WAL，维护窗口内无 readiness failure；
- 历史连续旧实现仍证明在线叠加导入负载风险存在，因此维护窗口约束继续保留。

剩余 P0：

1. PR human review/merge 与正式发布审批。
2. 接入第三方告警目标并验证告警送达。
3. 完成真实管理员/学生 UAT。
4. 若要支持在线导入，升级硬件并建立跨硬件容量阈值。

完整证据见 [`b9.36-b9.38-workflow-realtime-capacity.md`](b9.36-b9.38-workflow-realtime-capacity.md)。

### P1：批量运营与错误处置

单题审批责任链和 Import Jobs realtime progress 已完成。下一层缺口是：

- Question Review 批量操作、审批通知、source drift 报告。
- Import Jobs 文件/行级错误下载、事件保留策略、跨硬件容量阈值。

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

### B9.38 后的候选

1. 先完成人工 UAT、PR review/merge、外部告警接入和正式发布决策。
2. 如果用户审查认为学生学习闭环更重要，进入 Learning 前端 IA/功能页。
3. 如果管理员需要规模化运营，做 Question Review 批量工作流和 Import error download。
4. 如果工程维护成本开始阻塞功能开发，再做 route validation/error mapping helpers 收敛。

### 不建议作为下一阶段

- 大规模视觉重做。
- 管理平台最终 dashboard。
- 非客观题完整链路。
- 外部队列服务。

这些都可以做，但现在不是最高性价比。

## 8. 当前决策点

我们现在需要决定下一步走哪条：

1. **发布治理路线：人工 UAT、PR review/merge、外部告警和正式发布审批。**
   这是当前唯一 P0，不再需要补本阶段部署证据。

2. **学生产品路线：Learning 前端 IA。**
   后端已就绪，适合在用户审核后定义学习中心，而不是先做最终视觉。

3. **管理运营路线：Question Review 批量复核与 Import error download。**
   单题闭环已稳定，下一步才是规模化运营。

4. **工程路线：route validation/error mapping helpers。**
   属于明确技术债，但可根据后续功能开发的阻塞程度安排。

我的建议是：
**先停止继续扩大底层能力，保留 `da89292` + migration `0015` 作为可审核 staging 基线。下一步先做人工 UAT 和发布治理；通过后，再根据审核反馈选择 Learning 前端 IA 或批量运营能力。最终视觉仍后置。**
