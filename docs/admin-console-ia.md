# Admin Console IA Gate

状态日期：**2026-07-15**

本文件是管理端正式前端前的信息架构闸门。它不是视觉设计稿，也不是 `apps/admin` 实现计划；目的是先固定页面、权限、数据和状态，避免再次出现 UI 设计途中反向改后端语义。

## 1. 当前结论

正式 Admin 前端仍不应立即开工。当前可以进入“静态信息架构审核”：

- 后端 command/query 已覆盖 Auth、Bank Mapping、Import Jobs dry-run/Error Report/true import gate、Question Review、System Status、Audit Logs、Admin Users、Admin Students。
- 已有 `npm run admin:bootstrap` 创建第一个 `super_admin`；B9.14 staging 已创建 `admin` 并初始化 `202502040201`–`202502040230` 的 `2班` 学生账号。
- 仍缺正式 Admin 前端；true import 已由 `ADMIN_IMPORT_ENABLE_WRITE=true` 保护，reset/队列/取消重试仍未做。
- 因此前端之前必须先确认管理端页面分区和各页面状态，不做视觉精修。

## 2. 第一版 Sitemap

```text
Admin Console
  Login
  Dashboard / System Status
  Bank Mappings
    List
    Detail / Edit
    Bulk Status
  Import Jobs
    List
    Create Dry-run
    Detail
    Error Report
  Question Review
    List
    Detail / Flag / Resolve / Ignore / Exclude
  Audit Logs
    List / Filter
  Admin Users
    Bootstrap Done State
    List / Detail / Create / Disable / Role Update
  Student Accounts
    List / Detail
    Create / Bulk Create
    Reset Password / Revoke Sessions
    Class / Group Filters
```

## 3. Permission Matrix

| Area | Read permission | Write permission | Roles |
| --- | --- | --- | --- |
| Self session | `admin:self:read` | logout self | all admin roles |
| Bank Mapping | `bank_mapping:read` | `bank_mapping:write`, `bank_mapping:publish` | content_editor, super_admin |
| Import Jobs | `import_job:read` | `import_job:create` | operator, super_admin |
| Question Review | `question_review:read` | `question_review:write` | content_editor, super_admin |
| System Status | `system_status:read` | none | operator, super_admin |
| Audit Logs | `audit_log:read` | none | super_admin |
| Admin Users | `admin_user:manage` | create/disable/role/password update | super_admin |
| Student Accounts | `student_account:read` | `student_account:write`, `student_account:reset_password`, `student_account:revoke_session` | operator, super_admin |

## 4. Page Contracts

### 4.1 Login

- Input：loginName、password。
- Success：进入 Dashboard。
- Failure states：
  - invalid credentials
  - disabled admin
  - network/server error
- Notes：使用 `bky_admin_session`，不复用学生 `bky_session`。

### 4.2 Dashboard / System Status

- API：`GET /api/admin/system/status`
- Must show：
  - API ok/version
  - DB ok/current migration
  - corpus counts
  - visible bank count
  - latest/running import job
  - open/blocking/excluded quality flags
- Empty/error states：
  - DB not ready
  - import_jobs table missing fallback
  - question_quality_flags table missing fallback

### 4.3 Bank Mappings

- APIs：
  - `GET /api/admin/bank-mappings`
  - `GET /api/admin/bank-mappings/:bankId`
  - `PATCH /api/admin/bank-mappings/:bankId`
  - `POST /api/admin/bank-mappings/bulk-status`
- Must show：
  - rawName vs bankName
  - visible/status
  - objectiveQuestionCount
  - version
  - updatedBy/updatedAt
  - studentPreview reason
- Required states：
  - no result
  - stale version conflict
  - cannot publish no-objective bank
  - partial success in bulk status

### 4.4 Import Jobs

- APIs：
  - `GET /api/admin/import-jobs`
  - `POST /api/admin/import-jobs`
  - `GET /api/admin/import-jobs/:id`
  - `GET /api/admin/import-jobs/:id/errors`
- Current mode：
  - `dry_run` always available when `sourceDir` passes allowlist
  - `mode=import` requires server-side `ADMIN_IMPORT_ENABLE_WRITE=true`
  - `resetBeforeImport=true` in import mode still returns `422`
- Must show：
  - status/progress
  - sourceDir
  - summary/errorSummary
  - createdBy
  - startedAt/finishedAt
- Required states：
  - source root forbidden
  - running conflict
  - resetBeforeImport requires super_admin
  - import mode not enabled

### 4.5 Question Review

- APIs：
  - `GET /api/admin/question-review`
  - `PATCH /api/admin/question-review/:questionId`
- Must show：
  - contentPreview
  - answerPreview
  - optionCount
  - flags
  - excludedFromPractice
- Actions：
  - add flag
  - resolve flag
  - ignore flag
  - toggle excludedFromPractice
- Required states：
  - no flags
  - missing question
  - invalid flag transition
  - excluded question removed from new practice sessions

### 4.6 Audit Logs

- API：`GET /api/admin/audit-logs`
- Filters：
  - actorAdminId
  - action
  - resourceType/resourceId
  - result
  - createdFrom/createdTo
  - limit/offset
- Must show：
  - actor
  - action
  - resource identity
  - before/after diff
  - metadata
  - result
  - createdAt
- Required states：
  - actor null for system/bootstrap
  - no result
  - forbidden for non-super_admin

### 4.7 Admin Users

Current:

- `npm run admin:bootstrap` creates the first `super_admin`.
- HTTP Admin User manage API exists: list/detail/create/update.
- Public admin registration remains closed.
- Lifecycle writes audit `admin_user.create` / `admin_user.update`.
- Backend prevents disabling/removing the last active `super_admin`.

Next UI decisions:

- How to present role changes and password reset confirmation.
- Whether disable should require a typed confirmation.
- How to show last-super-admin guard errors.


### 4.8 Student Accounts

Current:

- HTTP Admin Student Manage API exists: list/detail/create/bulk-create/update/reset-password/revoke-sessions.
- `operator` and `super_admin` can run day-to-day student account operations.
- `content_editor` does not receive student account permissions by default.
- B9.14 staging provisioned `202502040201`–`202502040230` as `2班` and migrated 13 legacy passwordless accounts.

APIs:

- `GET /api/admin/students`
- `GET /api/admin/students/:studentId`
- `POST /api/admin/students`
- `POST /api/admin/students/bulk-create`
- `PATCH /api/admin/students/:studentId`
- `POST /api/admin/students/:studentId/reset-password`
- `POST /api/admin/students/:studentId/revoke-sessions`

Must show:

- loginName / displayName
- className / groupName
- status
- passwordResetRequired
- lastLoginAt
- failedLoginCount / lockedUntil
- createdAt / updatedAt

Primary operations:

1. Create one student.
2. Bulk create by JSON paste/upload, max 200 per request.
3. Edit displayName/status/className/groupName.
4. Reset password and force `passwordResetRequired=true`.
5. Revoke sessions after reset or suspicious login.

Required states:

- duplicate loginName in bulk create.
- partial success with created/skipped/failed rows.
- disabled student cannot login.
- locked student shows lock expiry.
- reset password must not display password after confirmation unless operator explicitly generated it in that moment.
- old passwordless accounts should never appear after production gate; if they do, show migration warning.

### 4.9 Account Operations Flow

Operator flow for initial class rollout:

```text
Prepare roster -> Bulk create students -> Download/record generated credentials in secure channel only -> Deliver per student -> Student first login -> Force password change -> Monitor passwordResetRequired count
```

Operator flow for forgotten password:

```text
Find student -> Confirm identity out-of-band -> Reset password -> Revoke sessions -> Deliver temporary password -> Student changes password
```

Super admin flow for admin account:

```text
Create admin -> Assign least role -> Deliver temporary password -> Admin logs in -> Rotate password -> Audit log review
```

UI must not include public self-registration, public password recovery, email/SMS recovery, or student password export as a default action.

## 5. Static Wireframe Checklist

Before building `apps/admin`, confirm these with static sketches or tables:

- [ ] Navigation labels and grouping.
- [ ] Student Accounts section placement and operator visibility.
- [ ] Which roles can see each nav item.
- [ ] Empty/loading/error states for each page.
- [ ] Table columns and default sort for each list.
- [ ] Detail drawer/page contents.
- [ ] Write action confirmation dialogs.
- [ ] Student reset-password confirmation and one-time temporary password handling.
- [ ] Conflict and partial-success UI.
- [ ] Audit diff presentation.
- [ ] No student-only field leaks into admin routes by accident.
- [ ] No admin-only field leaks into student routes by accident.

## 6. Start-Frontend Gate

Only start formal Admin frontend when all are true:

- Admin User manage UI behavior is reviewed against the implemented API.
- Admin Student manage UI behavior and credential delivery runbook are reviewed together.
- Import true mode decision is made or explicitly deferred.
- IA checklist above is reviewed.
- API contract churn is low.
- We agree on whether Admin is separate `apps/admin` or a route inside `apps/web`.

当前建议：B9.15 运维基线、凭据交付流程和本 IA 已形成可审核稿；下一步仍应先做静态 IA/流程审核，不直接进入正式 Admin 视觉实现。
