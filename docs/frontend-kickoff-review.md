# B9.16 Pre-Frontend Review Packet

状态日期：**2026-07-15**
目标：在正式重做学生端视觉或创建管理端前端之前，先把“哪些页面存在、每页解决什么任务、依赖哪些后端 contract、哪些东西暂缓”固定下来。

本文不是 UI 视觉稿，不选择配色/字体/组件库，也不启动 `apps/admin` 实现。它是前端开工前的产品/信息架构审查包。

## 1. 当前结论

```text
frontend formal visual work = hold
student web P0 activation gap = first password change / account identity surface
admin console first useful slice = Student Accounts + System Status
recommended admin app shape = separate apps/admin, shared contracts/design tokens
review requirement = approve this packet before large UI implementation
```

推荐下一阶段不要直接“整体重做前端”。更稳的顺序是：

1. **B9.17 Student Activation Minimum UI**：只补正式账号启用所必需的学生首次改密/账号信息入口，不做视觉大改。
2. **B9.18 Admin Static Wireframe Review**：用静态页面表格/低保真图确认管理端导航、表格列、状态、弹窗和权限。
3. **B9.19 Admin Operational MVP**：如果 B9.18 通过，先做管理端 Student Accounts + System Status，而不是一次性做完整管理平台。
4. **B10 Student Visual Refresh**：等账号启用、管理端运营闭环和真实用户路径稳定后，再正式重做学生端视觉。

## 2. 为什么前端仍不应“一步到位”

当前后端能力已经明显超过现有前端表达能力，但直接重做 UI 风险很高：

- 学生端已有 `apps/web/src/App.tsx` 单体式页面，功能可用但继续叠加会进一步混乱。
- 管理端有后端 contract，但没有独立产品壳、独立鉴权壳和权限导航。
- 所有 43 个 staging 学生账号当前都处于 `passwordResetRequired=true`，没有正式前端改密入口会影响账号启用。
- 题库整理、导入任务、题目质检和学生账号运营属于不同工作流，不能用一个“管理页面”混在一起。

所以前端策略应改成：**先补 P0 启用入口，再低保真确认管理 IA，最后做视觉系统。**

## 3. Student Web 审查

### 3.1 当前已实现路由

| URL | 当前状态 | 主要 API | 备注 |
| --- | --- | --- | --- |
| `/` | 已实现 | `/api/auth/me`, `/api/practice/sessions?status=active` | 学生首页，展示继续练习和入口 |
| `/banks` | 已实现 | `/api/banks`, `POST /api/practice/sessions` | 题库筛选和创建练习 |
| `/practice/:sessionId` | 已实现 | `GET /api/practice/sessions/:sessionId`, drafts/progress/submit | active 练习和 completed 结果复用 |
| `/wrong-questions` | 已实现 | `/api/wrong-questions`, `/api/wrong-questions/review-sessions` | 错题列表、详情、掌握、再练 |
| `/history` | 已实现 | `/api/practice/sessions?status=completed` | 历史结果入口 |

### 3.2 Student P0 缺口

这些不是视觉优化，而是账号启用和安全主链路：

| Gap | 建议处理 | 后端 contract | 是否允许先于视觉重做实现 |
| --- | --- | --- | --- |
| 首次登录强制改密 | 新增 `/account/password` 或登录后强制 modal/page | `POST /api/auth/password/change` | 是，B9.17 |
| 账号身份说明 | 首页或用户菜单显示 loginName/displayName/className/groupName/passwordResetRequired | `GET /api/auth/me` | 是，B9.17 |
| 改密成功后的重新加载 | 成功后刷新 auth me，清除 `passwordResetRequired` UI gate | `AuthMeResponseV1` | 是，B9.17 |
| 改密错误状态 | 当前密码错误、新密码太短/不一致、网络失败 | shared error schema | 是，B9.17 |
| 退出/会话失效后的路由恢复 | 保留原目标 URL，登录后回到目标页 | 已有 router 基础 | 是，B9.17 可补测试 |

B9.17 不应顺手重做首页、题库、练习台样式；只用现有样式系统做功能入口。

### 3.3 Student P1 信息架构候选

后端 Learning 已有 dashboard/trends/goals/review-marks，但前端还没表达。建议先定 IA：

| Candidate | 建议 URL/位置 | 决策点 |
| --- | --- | --- |
| 学习概览 | `/learning` 或首页下方模块 | 是独立一级入口，还是首页卡片？ |
| 趋势/连续学习 | `/learning/trends` 或 `/learning` 内 tab | 是否需要图表库，还是先文本摘要？ |
| 学习目标 | `/learning/goals` 或 `/learning` 内卡片 | 目标修改是否需要确认/撤销？ |
| 长期复习标记 | `/review-marks` 或错题本筛选 | 与错题本合并还是独立？ |
| active session 归档/放弃 | 暂缓 | 后端 command 未固定前不做 UI |

推荐：先把 `/learning` 做成一个“学习档案”一级入口，内部包含概览、趋势、目标、长期复习入口。这样不会把首页继续塞满。

### 3.4 Student 设计不得做的事

- 不把 `classification`、`bank_mapping`、`attempt` 等内部词暴露给学生。
- 不在学生端放管理入口。
- 不做公开注册、公开找回密码、邮箱/短信找回。
- 不在页面或日志中显示临时密码列表。
- 不在 completed session 上提供“继续修改答案”。

## 4. Admin Console 审查

### 4.1 推荐应用边界

推荐创建独立 `apps/admin`，而不是把 Admin 作为 `apps/web` 的隐藏路由。

原因：

- 管理端使用 `bky_admin_session`，学生端使用 `bky_session`。
- 管理端权限、导航、错误处理、审计提示与学生端不同。
- 管理端 bundle 可以独立发布/保护，避免学生端暴露不必要页面代码。
- 仍可共享 `packages/shared` contracts、基础 CSS tokens 和通用 API client 模式。

如果为了早期速度暂时放入 `apps/web`，也必须使用独立 `/admin/*` shell、独立 auth state、独立 API client，并在 B10 前迁出。

### 4.2 Admin 第一版 sitemap

```text
Admin Login
  -> Dashboard / System Status
      |-- Student Accounts
      |-- Bank Mappings
      |-- Import Jobs
      |-- Question Review
      |-- Audit Logs
      `-- Admin Users
```

### 4.3 Admin MVP 顺序

| Phase | 页面 | 原因 |
| --- | --- | --- |
| Admin P0 | Login + System Status | 验证 admin auth、RBAC、运行状态 |
| Admin P0 | Student Accounts | 当前账号交付/重置/禁用/撤销会话是最现实运营需求 |
| Admin P1 | Bank Mappings | 题库可见性、命名、发布直接影响学生体验 |
| Admin P1 | Question Review | 支持题目异常排除，减少学生练习踩坑 |
| Admin P1 | Import Jobs | dry-run 和 error report 可视化；true import 仍 gated |
| Admin P2 | Audit Logs / Admin Users 完整 UI | super_admin 运维使用，频率低但必须可审计 |

不建议第一版先做 Import 全流程，因为 reset/异步队列/取消重试还没定，容易把管理端拖进后端语义变更。

### 4.4 Admin Student Accounts 必备 UI 状态

| State | UI 必须表达 |
| --- | --- |
| `passwordResetRequired=true` | 显示“待首次改密/临时密码状态” |
| disabled student | 列表和详情明确不可登录 |
| lockedUntil | 显示锁定到期时间，避免误判密码错误 |
| reset password | 一次性展示或交付临时密码；关闭后不可再查看 |
| revoke sessions | 重置密码后建议同时撤销会话 |
| bulk partial success | created/skipped/failed 分区，不把整批当失败 |
| legacy passwordless count > 0 | 显示 migration warning；正式环境应为 blocking |

### 4.5 Admin 设计不得做的事

- 不开放公网管理员注册。
- 不做学生密码批量导出为常规按钮。
- 不把 true import reset 暴露成可点击危险操作。
- 不在非 super_admin 面前展示 Admin Users 管理入口。
- 不用学生端页面套壳做管理端。

## 5. Frontend Code Architecture Gate

正式前端扩展前，建议先把当前学生端从“大 App 文件”拆出稳定边界。这个拆分可以与 B9.17 同步小步推进，但不应改变行为。

建议目录：

```text
apps/web/src/
  app/
    AppShell.tsx
    router.ts
  lib/
    apiClient.ts
    apiErrors.ts
  features/
    auth/
    account/
    sessions/
    catalog/
    practice/
    wrongbook/
    learning/
```

Admin 若启动：

```text
apps/admin/src/
  app/
    AdminAppShell.tsx
    adminRouter.ts
  lib/
    adminApiClient.ts
  features/
    adminAuth/
    systemStatus/
    studentAccounts/
    bankMappings/
    importJobs/
    questionReview/
    auditLogs/
    adminUsers/
```

代码规则：

- API response 一律走 shared v1 schema parse。
- 页面不直接拼内部数据库字段名；在 feature model 层转换成 UI 文案。
- router 负责 URL，feature 负责业务状态，API client 负责错误归一化。
- 大 UI 改造前先补测试：router、auth gate、password change、admin permission nav。

## 6. Review Questions For Owner

请在进入正式 UI 前确认这些问题：

1. 学生首次改密入口：用独立 `/account/password` 页面，还是登录后 blocking modal？推荐独立页面。
2. 学习概览：作为独立 `/learning` 一级入口，还是首页模块？推荐独立入口 + 首页摘要。
3. 管理端是否同意创建 `apps/admin`？推荐同意。
4. 管理端第一版是否先做 Student Accounts + System Status？推荐同意。
5. 题库整理和导入任务，是否接受先只做 read/dry-run/可见性编辑，不做 reset/异步队列？推荐接受。
6. 前端视觉阶段是否等 B9.17/B9.18 完成后再开始？推荐等待。

## 7. Sign-off Checklist

正式开始前端实现前，需要勾选：

- [ ] B9.16 本审查包已由 owner 看过。
- [ ] 学生账号启用 P0 范围已确认。
- [ ] `/account/password` 或替代入口已确认。
- [ ] `/learning` 是否作为一级入口已确认。
- [ ] `apps/admin` 是否创建已确认。
- [ ] Admin MVP 页面顺序已确认。
- [ ] 不做事项列表已确认。
- [ ] 视觉设计阶段单独排期，不与 P0 功能混做。

## 8. 推荐下一步

建议执行：

> **B9.17 Student Activation Minimum UI**：在不重做视觉的前提下，补学生首次改密/账号身份入口、auth gate 和最小测试，让 staging 的 43 个临时密码账号具备完整启用闭环。

B9.17 完成后，再执行 Admin 静态 wireframe 或 `apps/admin` 骨架，而不是直接整体美化学生端。

## 9. B9.17 执行结果

B9.17 已按本审查包的最小范围实现，不包含整体视觉重做和管理端实现。

已完成：

- 学生登录表单要求密码，并调用正式 `POST /api/auth/login` 请求体。
- 新增 `/account/password` 学生账号启用/改密入口。
- 登录或恢复 session 后，如果 `passwordResetRequired=true`，自动拦截到 `/account/password`。
- 改密调用 `POST /api/auth/password/change`，成功后重新读取 `GET /api/auth/me` 并回到原目标页。
- 用户菜单和账号页显示 loginName、displayName、className、groupName、待改密/已启用状态。
- Playwright 覆盖“临时密码账号访问练习 -> 强制改密 -> 返回原练习 URL”。

仍未做：

- 不重做学生端视觉。
- 不新增 Learning Dashboard 完整页面。
- 不创建 `apps/admin`。
- 不实现 public 注册/找回、邮箱/短信找回。

B9.17 后推荐下一步：**B9.18 Admin Static Wireframe Review**，用静态表格/低保真页面确认 `apps/admin` 的导航、Student Accounts、System Status、权限状态和操作确认，再决定是否进入 Admin Operational MVP。

## 10. B9.18 执行结果

B9.18 已补管理端静态 wireframe 审查包：[`admin-static-wireframe-review.md`](./admin-static-wireframe-review.md)。

已固定：

- 推荐独立 `apps/admin`。
- B9.19 第一版范围：Admin Login、System Status、Student Accounts。
- Student Accounts 列表/详情/创建/批量创建/重置密码/撤销会话的静态 wireframe。
- operator/content_editor/super_admin 的导航可见性矩阵。
- 403、空列表、partial success、locked student、passwordResetRequired、reset password one-time display 等状态。

B9.18 仍未创建正式 Admin 前端，也未做视觉系统。若 owner 接受，下一步建议 B9.19 Admin Operational MVP。
