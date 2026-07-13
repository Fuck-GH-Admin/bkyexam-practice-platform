# Admin Console IA Gate

状态日期：**2026-07-14**

本文件是管理端正式前端前的信息架构闸门。它不是视觉设计稿，也不是 `apps/admin` 实现计划；目的是先固定页面、权限、数据和状态，避免再次出现 UI 设计途中反向改后端语义。

## 1. 当前结论

正式 Admin 前端仍不应立即开工。当前可以进入“静态信息架构审核”：

- 后端 command/query 已覆盖 Auth、Bank Mapping、Import Jobs dry-run/Error Report、Question Review、System Status、Audit Logs、Admin Users。
- 已有 `npm run admin:bootstrap` 创建第一个 `super_admin`。
- 仍缺真正写入 import mode 和正式 Admin 前端；Admin User manage 与 import error report 已完成后端 API。
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
  - `dry_run` only
  - `mode=import` returns `422`
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

## 5. Static Wireframe Checklist

Before building `apps/admin`, confirm these with static sketches or tables:

- [ ] Navigation labels and grouping.
- [ ] Which roles can see each nav item.
- [ ] Empty/loading/error states for each page.
- [ ] Table columns and default sort for each list.
- [ ] Detail drawer/page contents.
- [ ] Write action confirmation dialogs.
- [ ] Conflict and partial-success UI.
- [ ] Audit diff presentation.
- [ ] No student-only field leaks into admin routes by accident.
- [ ] No admin-only field leaks into student routes by accident.

## 6. Start-Frontend Gate

Only start formal Admin frontend when all are true:

- Admin User manage UI behavior is reviewed against the implemented API.
- Import true mode decision is made or explicitly deferred.
- IA checklist above is reviewed.
- API contract churn is low.
- We agree on whether Admin is separate `apps/admin` or a route inside `apps/web`.

当前建议：继续后端 true import mode gate 或学生学习统计；暂不启动正式 Admin 前端。
