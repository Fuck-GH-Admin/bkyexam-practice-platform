# B9.18 Admin Static Wireframe Review

状态日期：**2026-07-15**
目标：在创建正式 `apps/admin` 或写管理端 UI 之前，用静态 wireframe、状态表和操作流确认管理平台第一版边界。

本文不是视觉设计稿，不选择最终配色/组件库，不创建 `apps/admin`，也不实现任何 Admin 页面。它只用于 owner/reviewer 审核“管理端第一版到底长什么样、哪些状态必须有、哪些能力继续暂缓”。

## 1. 当前结论

```text
B9.18 static review packet = ready for owner review
formal admin implementation = hold
recommended first runtime slice = B9.19 Admin Operational MVP
B9.19 scope = apps/admin shell + admin login + system status + student accounts
visual polish = defer
import reset/async queue = defer
```

推荐：如果本审查包通过，下一阶段进入 **B9.19 Admin Operational MVP**，只实现最小管理端骨架、System Status 和 Student Accounts；仍不做完整题库整理/导入/质检 UI。

## 2. Product Boundary

Admin Console 是独立产品面，不应在学生端“多显示几个按钮”。建议最终形态：

```text
apps/admin
  /admin/login
  /admin
  /admin/system
  /admin/students
  /admin/students/:studentId
  /admin/students/bulk-create
  /admin/bank-mappings        # P1
  /admin/import-jobs          # P1
  /admin/question-review      # P1
  /admin/audit-logs           # P2 / super_admin
  /admin/users                # P2 / super_admin
```

早期若技术上复用 `apps/web`，也必须保持独立 `/admin/*` shell、独立 admin session state、独立 API client，并在 B10 前迁出；不允许把 Admin 嵌入学生导航。

## 3. Role And Navigation Matrix

| Nav item | operator | content_editor | super_admin | B9.19? |
| --- | --- | --- | --- | --- |
| Dashboard / System Status | show | hide | show | yes |
| Student Accounts | show | hide | show | yes |
| Bank Mappings | hide | show | show | placeholder only |
| Import Jobs | show | hide | show | placeholder only |
| Question Review | hide | show | show | placeholder only |
| Audit Logs | hide | hide | show | placeholder only |
| Admin Users | hide | hide | show | placeholder only |

B9.19 允许 placeholder nav，但不可实现半成品写操作。placeholder 点击后应显示“此功能后续阶段开放”，而不是打开空白页面。

## 4. Admin Login Wireframe

```text
┌────────────────────────────────────────────┐
│ BKYExam Admin                              │
│ 题库与账号运营入口                         │
│                                            │
│ Login name                                 │
│ [ admin______________________________ ]    │
│ Password                                   │
│ [ ********___________________________ ]    │
│                                            │
│ [ 登录管理后台 ]                           │
│                                            │
│ 状态提示：                                 │
│ - 登录失败 / 账号禁用 / 临时锁定           │
│ - 当前不是学生登录入口                     │
└────────────────────────────────────────────┘
```

Required states:

| State | UI behavior |
| --- | --- |
| unauthenticated | show login form |
| invalid credentials | inline error, do not reveal whether account exists |
| disabled admin | inline error, no retry countdown |
| locked admin | show lock message and rough retry time if API provides it |
| expired admin session | redirect to `/admin/login`, preserve target path |
| already logged in | redirect to `/admin/system` |

## 5. Admin Shell Wireframe

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Topbar: BKYExam Admin                         admin user ▾ logout   │
├───────────────┬─────────────────────────────────────────────────────┤
│ Sidebar       │ Page header                                         │
│               │ Breadcrumb / last refreshed / primary action        │
│ ▸ System      │                                                     │
│ ▸ Students    │ Main content                                        │
│ ▸ Banks       │                                                     │
│ ▸ Imports     │                                                     │
│ ▸ Review      │                                                     │
│ ▸ Audit       │                                                     │
│ ▸ Admin Users │                                                     │
└───────────────┴─────────────────────────────────────────────────────┘
```

Shell requirements:

- sidebar items are role-filtered, not merely disabled.
- forbidden direct URL shows `403` panel with “切换账号/返回 System”。
- all write actions show actor and target before confirmation.
- every page has loading/empty/error states.
- admin `bky_admin_session` is separate from student `bky_session`.

## 6. System Status Wireframe

```text
System Status
Last refreshed: 2026-07-15 11:30:00     [刷新]

┌──────────────┬──────────────┬──────────────┬──────────────┐
│ API          │ Database     │ Corpus       │ Quality      │
│ ok / version │ ok/migration │ Q/Banks/etc  │ open/block   │
└──────────────┴──────────────┴──────────────┴──────────────┘

Import status
┌────────────────────────────────────────────────────────────┐
│ tableExists | runningJobId | lastJob status | finishedAt   │
└────────────────────────────────────────────────────────────┘

Operational notes
- true import write gate: read-only display only in B9.19
- reset import: not available
- external alerting: link to ops doc, not configured in UI
```

Current API source: `GET /api/admin/system/status`.

Fields currently available:

- `api.ok/service/version`
- `database.ok/migrationCount/currentMigration`
- `corpus.classifications/questions/questionOptions/bankMappings/visibleBanks`
- `imports.tableExists/runningJobId/lastJob`
- `quality.tableExists/openFlags/blockingFlags/excludedQuestions`

Not currently available in System Status API:

- `passwordResetRequiredStudents`
- locked student count
- old passwordless count
- external healthcheck timer status

B9.19 should not fake those fields. If desired, add an explicit backend endpoint later or show them on Student Accounts filters.

## 7. Student Accounts List Wireframe

```text
Student Accounts                                      [单个创建] [批量创建]
Filters: [关键字____] [班级 v] [分组 v] [状态 v] [待改密 v] [锁定 only]

┌──────────────┬──────────────┬──────┬──────┬──────────┬──────────┬────────────┬─────────┐
│ Login name   │ Display name │ 班级 │ 分组 │ 状态     │ 改密     │ 最近登录   │ Actions │
├──────────────┼──────────────┼──────┼──────┼──────────┼──────────┼────────────┼─────────┤
│ 202502040201 │ 202502040201 │ 2班  │ -    │ active   │ 待改密   │ -          │ 查看    │
│ legacy001    │ legacy001    │ -    │ -    │ active   │ 待改密   │ 2026-...   │ 查看    │
└──────────────┴──────────────┴──────┴──────┴──────────┴──────────┴────────────┴─────────┘
Page: 1 / hasMore                                  [上一页] [下一页]
```

API source: `GET /api/admin/students`.

Default filters:

```text
limit=20
offset=0
status=active
keyword unset
className unset
groupName unset
passwordResetRequired unset
lockedOnly unset
```

Table columns required for B9.19:

| Column | Field | Notes |
| --- | --- | --- |
| Login name | `loginName` | primary identity |
| Display name | `displayName` | editable |
| Class | `className` | text field, nullable |
| Group | `groupName` | text field, nullable |
| Status | `status` | active/disabled badge |
| Password reset | `passwordResetRequired` | “待改密/已启用” |
| Lock | `lockedUntil` | show only if present |
| Last login | `lastLoginAt` | “从未登录” if null |
| Actions | detail | do not inline reset password in list |

## 8. Student Detail Drawer/Page Wireframe

```text
Student Detail: 202502040201

Identity
┌──────────────────────────────────────────────┐
│ loginName: 202502040201                      │
│ displayName: [202502040201______________]    │
│ className:   [2班_______________________]    │
│ groupName:   [__________________________]    │
│ status:      [active v]                      │
│ [保存资料]                                  │
└──────────────────────────────────────────────┘

Security
┌──────────────────────────────────────────────┐
│ passwordResetRequired: 待改密                │
│ passwordChangedAt: -                         │
│ failedLoginCount: 0                          │
│ lockedUntil: -                               │
│ lastLoginAt: -                               │
│ [重置密码] [撤销所有会话]                    │
└──────────────────────────────────────────────┘

Audit summary
createdBy / createdAt / updatedAt
```

APIs:

- `GET /api/admin/students/:studentId`
- `PATCH /api/admin/students/:studentId`
- `POST /api/admin/students/:studentId/reset-password`
- `POST /api/admin/students/:studentId/revoke-sessions`

Required state handling:

| State | UI behavior |
| --- | --- |
| disabled | show “不可登录”，still allow edit if permission permits |
| locked | show lock expiry; reset password should clear backend failure state only if API does so |
| passwordResetRequired | show warning “学生需先完成首次改密” |
| no class/group | display `-`, not `null` |
| forbidden | show 403, do not leak details |
| not found | show not-found panel, return to list |

## 9. Create Student Wireframe

```text
Create Student

loginName *        [202502040231________]
displayName        [202502040231________]
initialPassword *  [********____________]
className          [2班_________________]
groupName          [____________________]
passwordResetRequired [x]

[创建学生] [取消]
```

API: `POST /api/admin/students`.

Rules:

- `initialPassword` is required and min 8.
- default `passwordResetRequired=true`.
- UI must not persist or re-display password after success.
- success view may show “账号已创建；请通过安全渠道交付临时密码”。

## 10. Bulk Create Wireframe

```text
Bulk Create Students

Options
[x] skipExisting
[x] revokeExistingSessions
[x] passwordResetRequired
Default initial password [ optional, not recommended for production ]

Input JSON / CSV paste
┌──────────────────────────────────────────────┐
│ loginName,displayName,className,groupName... │
│ 202502040201,202502040201,2班,               │
│ 202502040202,202502040202,2班,               │
└──────────────────────────────────────────────┘

[Dry parse locally] [提交批量创建]

Result
┌─────────┬──────────────┬─────────────────────┐
│ created │ skipped      │ failed              │
│ 28 rows │ 2 duplicates │ 1 invalid password  │
└─────────┴──────────────┴─────────────────────┘
```

API: `POST /api/admin/students/bulk-create`.

Current contract accepts JSON, max 200 students/request. If CSV paste is added, client must convert to JSON before calling API; no backend CSV endpoint exists.

Partial-result rendering is mandatory:

- `created[]`: show loginName/className/groupName/status.
- `skipped[]`: show loginName + reason.
- `failed[]`: show loginName + error.

Do not show a single red “失败” banner when only some rows failed.

## 11. Reset Password Confirmation

```text
Confirm Reset Password

Target: 202502040201 / 2班
New temporary password [********____]
[x] Force passwordResetRequired
[x] Revoke existing sessions

This action will:
- Replace the student's password.
- Require the student to change it after login.
- Write an audit log.
- Optionally revoke active sessions.

[确认重置] [取消]
```

API: `POST /api/admin/students/:studentId/reset-password`.

Rules:

- temporary password is only visible before submit or in immediate success state if operator typed/generated it locally.
- after modal closes, password cannot be retrieved.
- success must show `revokedSessions`.
- recommend pairing reset with revoke sessions by default.

## 12. Revoke Sessions Confirmation

```text
Confirm Revoke Sessions

Target: 202502040201
Reason: password reset / suspicious login / manual support

[撤销所有会话] [取消]

Result: revokedSessions = N
```

API: `POST /api/admin/students/:studentId/revoke-sessions`.

B9.19 may use a simple confirmation modal; typed confirmation is optional unless owner requests stricter operations controls.

## 13. Error And Empty States

| Surface | State | Required UI |
| --- | --- | --- |
| Login | invalid credentials | inline error, no account enumeration |
| Login | locked admin | inline error, keep form |
| Shell | forbidden nav | hide nav item by default |
| Direct URL | forbidden | 403 panel |
| System | DB down | red DB card, no fake counts |
| System | import table missing | neutral “not initialized” state |
| Student list | empty | “没有匹配学生”，keep filters visible |
| Student list | network error | retry button |
| Bulk create | partial success | created/skipped/failed groups |
| Detail | not found | return to list |
| Reset password | validation error | keep modal open |
| Revoke sessions | zero revoked | success state, not warning |

## 14. B9.19 Implementation Gate

Only start B9.19 if owner accepts:

- [ ] independent `apps/admin` preferred.
- [ ] B9.19 scope limited to Admin Login, System Status, Student Accounts.
- [ ] Bank Mappings / Import Jobs / Question Review are placeholders or P1.
- [ ] No public admin registration.
- [ ] No public student registration or self-service recovery.
- [ ] No import reset / async queue / cancel retry.
- [ ] No student password export as normal operation.
- [ ] Reset-password temporary password handling is one-time only.

## 15. Recommended Next Step

If approved, execute:

> **B9.19 Admin Operational MVP**: create the admin app skeleton with shared contract parsing, admin login/session guard, System Status dashboard, Student Accounts list/detail/create/bulk-create/reset-password/revoke-sessions, and Playwright/admin route smoke.

B9.19 must still avoid final visual polish. The goal is an operator-usable management surface, not a finished design system.
