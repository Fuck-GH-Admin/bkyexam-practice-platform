# Identity Security Strategy

状态日期：**2026-07-15**

本文冻结正式身份与账号安全方向。它是 B9.4 的策略文件，不表示所有能力已经实现；当前代码仍处于“学生用户名即身份”的 MVP 状态。后续代码阶段必须按本文拆成小切片实现，并在每一阶段通过 shared contract、route test、PostgreSQL integration 和 `npm run verify:docker` 后再提交。

## 1. 决策摘要

| 主题 | 决策 |
| --- | --- |
| 学生账号来源 | **管理员批量创建/导入**；不开放公网自助注册。 |
| 学生登录凭据 | **用户名/学号 + 密码**；继续使用 `loginName` 作为唯一登录标识。 |
| 学生密码找回 | **管理员重置密码**；暂不做短信、邮箱找回或公开找回入口。 |
| 学生组织字段 | 先加 `className` / `groupName` 文本字段，不建正式 school/class/enrollment 组织模型。 |
| 已知班级规则 | `202502040201`–`202502040230` 属于 **2班**；其余学生暂未定，保留空值或后续批量更新。 |
| 登录失败策略 | 启用失败计数和临时锁定，但比公网强安全系统放宽；配合全局 rate limit。 |
| 旧账号迁移 | **旧学生账号保留**；不清空测试/历史数据。正式模式下逐步补齐密码，不继续依赖无密码登录。 |
| 前端实现 | 暂不做正式前端；只先冻结 contract、数据模型和 API 边界。 |

## 2. 当前状态

当前已实现：

- `students.login_name` 唯一。
- `students.password_hash` 已存在，但 PostgreSQL 学生登录仍允许首次使用 `loginName` 自动创建学生。
- B9.5 已扩展 `students`：`class_name`、`group_name`、`status`、`password_reset_required`、失败计数、临时锁定、`last_login_at` 和 `created_by_admin_id`。
- B9.5 已把 `202502040201`–`202502040230` 的默认 `className` 规则落入 migration 与登录创建 helper。
- Auth shared contract 已支持 `className/groupName/passwordResetRequired`。
- `student_sessions` 已有服务端 session 和 httpOnly `bky_session`。
- Admin Auth/RBAC/Audit/User manage/bootstrap 已实现。
- B9.6 已实现 Admin Student Manage API：list/detail/create/bulk-create/update/reset-password/revoke-sessions。
- B9.6 已把 `student_account:read/write/reset_password/revoke_session` 纳入 RBAC，`operator` 可执行日常学生账号运营。
- 管理员重置密码会写入 hash、设置 `passwordResetRequired=true`、清空失败/锁定状态，并可撤销学生现有 session。
- `x-request-id`、secure headers、可配置 rate limit/CSRF origin check、readiness、metrics smoke 已实现。

当前不能公开生产的原因：

- 学生登录仍处在兼容旧账号阶段；未默认强制 `password`。
- 学生临时密码登录后的 force-change 流程尚未完成。
- 登录失败锁定字段已落入学生身份模型，但失败计数递增/解锁流程尚未启用。
- 旧账号保留策略已落入数据模型，但正式 password enforcement 尚未实现。

## 3. 学生账号生命周期

### 3.1 创建方式

正式策略只允许管理员创建学生账号：

1. 管理员单个创建。
2. 管理员批量创建/导入。
3. 后续可追加邀请码注册，但不是当前阶段。

不做：

- 不开放 public registration。
- 不允许任意 `loginName` 首次访问自动注册正式账号。
- 不使用邮箱/短信作为第一版账号源。

### 3.2 登录标识

`loginName` 继续作为唯一登录标识，可承载：

- 学号，例如 `202502040201`。
- 用户名，例如 `alice`。
- 未来如需要也可承载邮箱格式，但不把 email 作为当前必填字段。

显示名称仍使用 `displayName`。

### 3.3 班级/分组字段

第一版只加入两个文本字段：

```text
className: string | null
groupName: string | null
```

约定：

- `className` 用于班级、人群或教学班展示。
- `groupName` 用于更轻量的小组、批次、实验组或未定分组。
- 当前已知规则：`202502040201` 到 `202502040230` 的 `className` 设为 `2班`。
- 其余学生的 `className/groupName` 可以暂为 `null`，等待运营数据确定。

暂不做：

- `schools`
- `classes`
- `student_enrollments`
- 班级管理员
- 复杂组织权限

原因：当前产品核心仍是练习平台；过早建立组织模型会影响管理端和权限设计，先用文本字段支持内部试用更稳。

## 4. 密码与重置策略

### 4.1 密码规则

学生密码第一版建议：

- 最少 8 个字符。
- 最多 128 个字符。
- 不强制大小写/符号组合。
- 禁止空白密码。
- 服务端只保存 password hash。

管理员密码继续至少 8 个字符；后续可对管理员加更高强度要求，但当前不阻断 B9.4。

### 4.2 管理员重置密码

学生忘记密码时，由管理员重置：

1. 管理员在 Admin Student Manage API 中选择学生。
2. 服务端生成或接收临时密码。
3. 写入新的 `password_hash`。
4. 设置 `passwordResetRequired=true`。
5. 撤销该学生现有 session。
6. 记录 admin audit log。

学生用临时密码登录后，应先修改密码，再进入正式练习流程。

### 4.3 旧账号迁移

旧账号策略：

- 保留所有现有 `students` 行。
- 不清空 `practice_sessions`、`practice_attempts`、`wrong_questions`、`student_learning_goals`、`question_bookmarks`。
- `password_hash IS NULL` 的学生被视为 legacy account。
- 生产模式下 legacy account 不应继续无密码登录。

迁移落地方式建议：

1. 新增管理员批量设置临时密码能力。
2. 为旧账号批量写入临时密码或标记 `passwordResetRequired=true`。
3. 保留一个仅用于本地测试/过渡的显式开关：

```text
STUDENT_LEGACY_PASSWORDLESS_LOGIN_ENABLED=false
```

默认 `false`。只有本地开发或迁移窗口可以临时开启；公开生产必须关闭。

## 5. 登录失败策略

用户希望策略相对放宽，因此第一版不做过激锁死。

### 5.1 学生登录

建议规则：

- 同一 `loginName` 在 15 分钟窗口内失败 10 次，锁定 10 分钟。
- 成功登录后清空失败计数和锁定状态。
- 被锁定时返回通用 `401` 或 `423` 需后续 contract 决策；不暴露“账号存在与否”细节。
- 同 IP 继续依赖现有平台级 rate limit。

建议错误文案：

```json
{ "error": "Invalid credentials" }
```

锁定时也不要泄露过多细节；前端可统一提示“登录失败次数较多，请稍后再试或联系管理员”。

### 5.2 管理员登录

管理员比学生略严格，但仍不做过强 MFA：

- 同一 admin loginName 在 15 分钟窗口内失败 8 次，锁定 15 分钟。
- 管理员失败登录写 audit log。
- 管理员禁用账号继续返回 `403`。
- 成功登录写 `admin.auth.login` audit log，并清空失败计数。

### 5.3 全局 rate limit

沿用 B9.1 guardrail：

- `RATE_LIMIT_ENABLED`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`

后续身份阶段应给登录路由单独的更小限额，但不要马上引入复杂分布式 rate limit。多实例生产前需替换为 Redis/网关级限流。

## 6. 目标数据模型

后续 migration 建议扩展 `students`：

```text
students
  login_name
  display_name
  password_hash
  class_name
  group_name
  status                  active | disabled
  password_reset_required boolean
  password_changed_at
  failed_login_count
  failed_login_window_started_at
  locked_until
  last_login_at
  updated_at
  created_by_admin_id     nullable admin FK
```

可选新增：

```text
student_import_jobs or reuse admin import job kind
student_password_events
```

第一版可以先不新增 `student_password_events`，通过 `audit_logs` 记录管理员创建、批量创建、禁用和重置密码事件。

## 7. 目标 API 边界

### 7.1 学生 Auth

当前：

```http
POST /api/auth/login
```

目标 request：

```json
{
  "loginName": "202502040201",
  "password": "student-password"
}
```

目标 response 增加组织字段：

```json
{
  "student": {
    "id": "student-uuid",
    "loginName": "202502040201",
    "displayName": "202502040201",
    "className": "2班",
    "groupName": null
  },
  "passwordResetRequired": false
}
```

若 `passwordResetRequired=true`，后续前端应进入修改密码流程。

已实现接口：

```http
POST /api/auth/password/change
```

用途：

- 学生已登录后修改自己的密码。
- 临时密码登录后完成强制修改。

### 7.2 Admin Student Manage

新增目标接口：

```http
GET    /api/admin/students
POST   /api/admin/students
POST   /api/admin/students/bulk-create
GET    /api/admin/students/:studentId
PATCH  /api/admin/students/:studentId
POST   /api/admin/students/:studentId/reset-password
POST   /api/admin/students/:studentId/revoke-sessions
```

已实现权限：

```text
student_account:read
student_account:write
student_account:reset_password
student_account:revoke_session
```

已实现角色边界：

- `operator`：可读学生、单个/批量创建、更新轻量字段、重置密码、撤销学生 session。
- `content_editor`：默认不管理学生账号。
- `super_admin`：全部学生账号权限。

### 7.3 批量创建格式

建议支持 JSON request，不先做 CSV 上传：

```json
{
  "students": [
    {
      "loginName": "202502040201",
      "displayName": "202502040201",
      "className": "2班",
      "groupName": null,
      "initialPassword": "temporary-password"
    }
  ],
  "options": {
    "defaultInitialPassword": "temporary-password",
    "passwordResetRequired": true,
    "revokeExistingSessions": true,
    "skipExisting": true
  }
}
```

服务端规则：

- 单次批量数量先限制在 200。
- `loginName` 应唯一；同一 request 内重复会进入 `failed`，已存在账号按 `skipExisting` 进入 `skipped` 或 `failed`。
- `initialPassword` 可统一传默认临时密码，也可每个学生单独传。
- response 返回 created / skipped / failed 三类结果。
- 不返回明文密码。

## 8. Session / Cookie / CSRF 策略

学生 session：

- `bky_session`
- httpOnly
- sameSite=lax
- production `secure=true`
- 默认 TTL 可保持 30 天；公开生产前可改为 14 天或提供“记住我”决策。

管理员 session：

- `bky_admin_session`
- httpOnly
- sameSite=lax
- production `secure=true`
- TTL 当前 8 小时可保留。

生产必须：

- `COOKIE_SECRET` 使用随机长密钥。
- `COOKIE_SECURE=true`。
- `CSRF_ORIGIN_CHECK_ENABLED=true`。
- `CSRF_ALLOWED_ORIGINS` 只包含正式 Web 域名。
- `RATE_LIMIT_ENABLED=true`。

## 9. 实施阶段建议

### B9.4 — Identity Security Strategy

状态：本文完成。

只冻结策略，不改行为。

### B9.5 — Student Identity Data Model

状态：**已完成，2026-07-15。**

- migration 扩展 `students`。
- shared student auth contract 增加 `className/groupName/passwordResetRequired`。
- repository/service 支持密码 hash、失败计数、锁定状态和旧账号识别。
- 不改正式前端。

已验证：

- migration test。
- shared contract test。
- route/unit test。
- PostgreSQL integration 覆盖旧账号保留和新字段。

### B9.6 — Admin Student Manage API

状态：**已完成，2026-07-15。**

目标：

- 管理员批量创建学生。
- 管理员重置学生密码。
- 管理员禁用/启用学生。
- 管理员撤销学生 session。
- audit log 记录创建、批量创建、密码重置、禁用/启用、撤销 session。

验收：

- RBAC boundary 已覆盖。
- 不返回 password/passwordHash 已覆盖。
- 批量创建 created/skipped/failed 部分结果已覆盖。
- PostgreSQL integration 已覆盖真实创建、重置密码、撤销 session 和 audit。

### B9.7 — Password Login Enforcement

目标：

- `POST /api/auth/login` 正式要求 `password`。
- legacy passwordless 仅在显式环境变量开启时允许。
- 失败计数、临时锁定、成功清空计数。
- 旧账号可保留但必须通过管理员设置临时密码后进入正式模式。

验收：

- 旧账号保留不破坏已有 practice/wrongbook/learning 数据。
- 无密码登录默认失败。
- 临时密码登录返回 `passwordResetRequired=true`。
- 修改密码后正常进入系统。
- `npm run verify:docker`。

## 10. 明确不做

- 不做公网注册。
- 不做邮箱/短信找回。
- 不做 SSO。
- 不做 MFA。
- 不做学校/班级正式组织树。
- 不做正式前端页面。
- 不做前端最终视觉。
- 不把登录失败策略做成过强封禁系统。

## 11. 当前一句话结论

正式身份路线确定为：

> **管理员批量创建学生；学生用用户名/学号 + 密码登录；管理员负责重置密码；学生只增加 className/groupName 轻量组织字段；202502040201–202502040230 暂归 2班；登录失败策略放宽但保留临时锁定；旧账号保留并通过迁移/临时密码进入正式模式。**
