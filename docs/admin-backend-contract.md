# Admin Backend Contract Design

状态日期：**2026-07-14**
阶段：**Phase B4 — Admin Backend Contract Design**
状态：**设计完成；B5 已部分实现 API/migration，UI 未开始**

本文定义 BKYExam 管理平台第一版后端 contract。它是下一阶段 **Phase B5 — Admin Backend MVP Implementation** 的实现依据。

B4 初稿只做设计，不创建 `apps/admin`，不实现 `/api/admin/*` route，不写 migration；B5 按本文逐步落地后，在下方用更新块标明已实现范围。

> B5 更新：2026-07-14 已实现 Admin Auth/RBAC/Audit foundation、Bank Mapping read/write APIs、System Status API、Import Jobs dry-run API 与 Question Review Flags API。包括 `0005_admin_foundation.sql`、`0006_import_jobs.sql`、`0007_question_quality_flags.sql`、`/api/admin/auth/login`、`/api/admin/me`、`/api/admin/auth/logout`、独立 `bky_admin_session`、`GET /api/admin/bank-mappings`、`GET /api/admin/bank-mappings/:bankId`、`PATCH /api/admin/bank-mappings/:bankId`、`POST /api/admin/bank-mappings/bulk-status`、`GET /api/admin/system/status`、`GET /api/admin/import-jobs`、`POST /api/admin/import-jobs`、`GET /api/admin/import-jobs/:id`、`GET /api/admin/question-review`、`PATCH /api/admin/question-review/:questionId`、shared v1 Admin Auth/Bank Mapping/System Status/Import Job/Question Review schema、optimistic concurrency、audit log、import running lock、source allowlist、quality flag、practice exclusion rule 和 PostgreSQL integration 测试。Audit Log read、Admin User manage、正式 Admin UI 仍按后续阶段实现。

## 1. 目标与非目标

### 1.1 目标

管理端第一版只解决四个运营工作流：

1. **题库整理**：查看、筛选、编辑、发布/隐藏自动生成的 `bank_mappings`。
2. **导入任务**：把现有 CLI 导入升级为可审计、可观察的后台任务。
3. **题目质检**：标记异常题、答案问题、选项缺失、乱码、重复题，并能影响学生端可见性策略。
4. **系统状态**：查看 API/DB/import/corpus 的可运营状态。

横切要求：

- 管理员身份独立于学生身份。
- 所有管理写操作必须有权限检查。
- 所有管理写操作必须写 audit log。
- 管理 API 使用 `/api/admin/*` namespace。
- 学生 API 不暴露 admin-only 字段。
- 不直接编辑原始导入题目；第一版只做 mapping override 与 quality flag。

### 1.2 非目标

本阶段不做：

- Admin UI。
- Figma 或视觉设计。
- 真实 route 实现。
- migration 实现。
- 队列系统或 worker 常驻进程。
- 在线编辑题干、答案、解析原文。
- 多租户、学校组织、课程班级。
- 复杂审批流。

## 2. 管理员角色与权限

### 2.1 角色

第一版固定三类角色：

| Role | 中文 | 定位 |
| --- | --- | --- |
| `content_editor` | 内容编辑 | 整理题库 mapping、标记题目质量问题。 |
| `operator` | 运营管理员 | 创建导入任务、查看任务和系统状态。 |
| `super_admin` | 超级管理员 | 拥有全部权限，管理管理员账号和高风险操作。 |

### 2.2 权限

第一版推荐显式 permission 字符串，即使数据库先用 role 推导也要在 contract 中返回 `permissions`，方便前端守卫。

| Permission | 用途 |
| --- | --- |
| `admin:self:read` | 读取当前管理员身份。 |
| `bank_mapping:read` | 查看题库 mapping。 |
| `bank_mapping:write` | 编辑题库 mapping 字段。 |
| `bank_mapping:publish` | 发布/隐藏题库。 |
| `question_review:read` | 查看题目质检列表和详情。 |
| `question_review:write` | 标记/关闭题目质量问题。 |
| `import_job:read` | 查看导入任务。 |
| `import_job:create` | 创建导入任务。 |
| `system_status:read` | 查看系统状态。 |
| `audit_log:read` | 查看审计日志。 |
| `admin_user:manage` | 管理管理员账号。第一版可只保留权限，不实现 UI。 |

### 2.3 角色到权限

| Role | Permissions |
| --- | --- |
| `content_editor` | `admin:self:read`, `bank_mapping:read`, `bank_mapping:write`, `bank_mapping:publish`, `question_review:read`, `question_review:write` |
| `operator` | `admin:self:read`, `bank_mapping:read`, `import_job:read`, `import_job:create`, `system_status:read` |
| `super_admin` | all permissions |

### 2.4 Session

管理端使用独立 Cookie：

```text
bky_admin_session
```

不要复用学生端 `bky_session`。管理端 session TTL 建议短于学生端，第一版建议 8 小时。

Cookie 策略：

```text
httpOnly=true
sameSite=lax
secure=production true / local false
path=/
```

## 3. 通用 API 约定

Base path：

```text
/api/admin
```

### 3.1 成功响应

成功响应全部使用 shared Zod schema，后续实现时放入：

```text
packages/shared/src/contracts/v1/admin.ts
```

如果文件过大，可拆成：

```text
contracts/v1/adminAuth.ts
contracts/v1/adminBankMapping.ts
contracts/v1/adminImportJob.ts
contracts/v1/adminQuestionReview.ts
contracts/v1/adminSystem.ts
```

### 3.2 错误响应

第一版沿用当前 shared error contract：

```json
{
  "error": "Human-readable message"
}
```

建议状态码：

| Status | 场景 |
| ---: | --- |
| `400` | 请求体或 query 无效。 |
| `401` | 未登录或 session 失效。 |
| `403` | 已登录但缺少权限。 |
| `404` | 资源不存在。 |
| `409` | optimistic concurrency/version 冲突，或导入锁冲突。 |
| `422` | 请求语义合法但违反业务规则，例如试图发布无客观题题库。 |
| `500` | 未预期错误或 contract fail-closed。 |

后续如需要 `code/requestId/details`，通过新 schema 或 optional 字段设计，不能静默改变当前 error contract。

### 3.3 Pagination

列表统一使用 offset pagination：

```json
{
  "page": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

第一版不做 total count，避免大型表的昂贵统计。

默认：

```text
limit=20
offset=0
max limit=100
```

### 3.4 Optimistic Concurrency

所有会覆盖运营字段的写操作必须带 `expectedVersion`。

冲突响应：

```http
409 Conflict
```

```json
{
  "error": "Bank mapping version conflict"
}
```

### 3.5 Audit

所有管理写操作必须记录：

- actor admin id
- action
- resource type
- resource id
- before snapshot
- after snapshot
- request metadata
- result
- timestamp

审计写入与业务写入应在同一 PostgreSQL transaction 中完成。

## 4. Workflow A — Admin Auth

### 4.1 `POST /api/admin/auth/login`

用途：管理员登录，创建 `bky_admin_session`。

Request：

```json
{
  "loginName": "operator@example.com",
  "password": "plaintext from login form"
}
```

Rules：

- `loginName` required non-empty string。
- `password` required non-empty string。
- 不支持 passwordless admin。
- 密码用现有 password hash helper 或更强策略。
- 登录成功更新 `last_login_at`。

Response：

```json
{
  "admin": {
    "id": "admin-user-uuid",
    "loginName": "operator@example.com",
    "displayName": "运营管理员",
    "roles": ["operator"],
    "permissions": ["admin:self:read", "import_job:read", "import_job:create", "system_status:read"]
  },
  "expiresAt": "2026-07-13T18:00:00.000Z"
}
```

Errors：

- `400` invalid request。
- `401` invalid credentials。
- `403` admin user disabled。

### 4.2 `GET /api/admin/me`

用途：恢复当前管理员。

Response：同 login response 的 `admin` 部分，可包含 `expiresAt`。

```json
{
  "admin": {
    "id": "admin-user-uuid",
    "loginName": "operator@example.com",
    "displayName": "运营管理员",
    "roles": ["operator"],
    "permissions": ["admin:self:read", "import_job:read", "system_status:read"]
  },
  "expiresAt": "2026-07-13T18:00:00.000Z"
}
```

### 4.3 `POST /api/admin/auth/logout`

用途：撤销当前管理员 session 并清 Cookie。

Response：

```json
{
  "success": true
}
```

无当前 session 时仍返回 success，行为与学生端 logout 一致。

## 5. Workflow B — Bank Curation

### 5.1 数据语义

管理端操作 `bank_mappings` 的产品字段：

- `subject_category`
- `subject_name`
- `bank_name`
- `visible`
- `status`
- `difficulty`
- `exam_purpose`
- `question_types`
- `audience`
- `keywords`
- `description`
- `notes`

不可覆盖来源字段：

- `bank_id`
- `raw_name`
- `parent_id`
- `q_group`
- `question_count`
- `descendant_question_count`

### 5.2 Bank status

第一版管理状态：

| Status | 语义 | 学生端可见 |
| --- | --- | --- |
| `review` | 待整理或待确认 | no |
| `active` | 已发布 | yes if `visible=true` |
| `hidden` | 手动隐藏 | no |
| `deprecated` | 不再使用 | no |

学生端 `/api/banks` 继续只返回：

```text
visible=true AND status='active' AND objective_question_count > 0
```

### 5.3 `GET /api/admin/bank-mappings`

Permission：`bank_mapping:read`

Query：

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `status` | enum | optional | `review|active|hidden|deprecated` |
| `visible` | boolean | optional | `true|false` |
| `subjectCategory` | string | optional | exact match |
| `subjectName` | string | optional | exact match |
| `keyword` | string | optional | bank name/raw name/keywords search |
| `qGroup` | integer | optional | source q_group |
| `parentId` | uuid | optional | source parent classification |
| `hasObjectiveQuestions` | boolean | optional | based on objective count |
| `limit` | integer | 20 | 1..100 |
| `offset` | integer | 0 | >= 0 |

Response：

```json
{
  "bankMappings": [
    {
      "bankId": "bank-uuid",
      "rawName": "2025年C++程序设计",
      "bankName": "2025年C++程序设计",
      "subjectCategory": "信息技术",
      "subjectName": "C++",
      "parentId": "parent-classification-uuid",
      "qGroup": 8,
      "visible": true,
      "status": "active",
      "difficulty": "unknown",
      "examPurpose": "exam",
      "questionTypes": ["single_choice", "multiple_choice", "yes_no"],
      "audience": "unknown",
      "keywords": ["C++", "信息技术", "2025"],
      "description": "自动映射生成的题库说明",
      "notes": "",
      "questionCount": 120,
      "descendantQuestionCount": 245,
      "objectiveQuestionCount": 180,
      "version": 3,
      "updatedAt": "2026-07-13T10:00:00.000Z",
      "updatedBy": {
        "id": "admin-user-uuid",
        "displayName": "内容编辑"
      }
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

Notes：

- `updatedAt/updatedBy/version` 需要 migration 后才能实现。
- 第一版列表不返回题目详情。

### 5.4 `GET /api/admin/bank-mappings/:bankId`

Permission：`bank_mapping:read`

Response：

```json
{
  "bankMapping": {
    "bankId": "bank-uuid",
    "rawName": "2025年C++程序设计",
    "bankName": "2025年C++程序设计",
    "subjectCategory": "信息技术",
    "subjectName": "C++",
    "parentId": "parent-classification-uuid",
    "parentName": "程序设计",
    "qGroup": 8,
    "visible": true,
    "status": "active",
    "difficulty": "unknown",
    "examPurpose": "exam",
    "questionTypes": ["single_choice", "multiple_choice", "yes_no"],
    "audience": "unknown",
    "keywords": ["C++", "信息技术", "2025"],
    "description": "自动映射生成的题库说明",
    "notes": "",
    "questionCount": 120,
    "descendantQuestionCount": 245,
    "objectiveQuestionCount": 180,
    "questionTypeCounts": {
      "single_choice": 80,
      "multiple_choice": 40,
      "yes_no": 60,
      "fill_blank": 20
    },
    "studentPreview": {
      "visibleInStudentCatalog": true,
      "reason": "visible active bank with objective questions"
    },
    "version": 3,
    "updatedAt": "2026-07-13T10:00:00.000Z",
    "updatedBy": {
      "id": "admin-user-uuid",
      "displayName": "内容编辑"
    }
  }
}
```

### 5.5 `PATCH /api/admin/bank-mappings/:bankId`

Permission：

- `bank_mapping:write` for metadata fields。
- `bank_mapping:publish` if changing `visible` or `status` to/from `active`。

Request：

```json
{
  "expectedVersion": 3,
  "changes": {
    "bankName": "C++ 程序设计题库",
    "subjectCategory": "信息技术",
    "subjectName": "C++",
    "visible": true,
    "status": "active",
    "difficulty": "mixed",
    "examPurpose": "exam",
    "audience": "beginner",
    "keywords": ["C++", "程序设计", "机考"],
    "description": "面向 C++ 程序设计课程的客观题练习。",
    "notes": "人工确认于 2026-07-13"
  }
}
```

Response：

```json
{
  "bankMapping": { "...": "same shape as detail" }
}
```

Audit action：

```text
bank_mapping.update
```

Business rules：

- `expectedVersion` 必填。
- 不能修改 raw/source 字段。
- `status=active` 且 `visible=true` 时，必须至少有一个客观题。
- 写入时 `version = version + 1`。
- audit log 存 before/after diff。

### 5.6 `POST /api/admin/bank-mappings/bulk-status`

Permission：`bank_mapping:publish`

Request：

```json
{
  "items": [
    { "bankId": "bank-uuid-1", "expectedVersion": 3 },
    { "bankId": "bank-uuid-2", "expectedVersion": 7 }
  ],
  "changes": {
    "visible": true,
    "status": "active"
  }
}
```

Response：

```json
{
  "updated": [
    { "bankId": "bank-uuid-1", "version": 4 },
    { "bankId": "bank-uuid-2", "version": 8 }
  ],
  "failed": [
    {
      "bankId": "bank-uuid-3",
      "error": "Bank mapping version conflict"
    }
  ]
}
```

Rules：

- 批量操作可以部分成功。
- 每个成功项都写独立 audit log。
- 单次最多 100 个 bank。

## 6. Workflow C — Import Jobs

### 6.1 Job Status

| Status | 语义 |
| --- | --- |
| `queued` | 已创建，等待执行。 |
| `running` | 正在执行。 |
| `succeeded` | 完成且无致命错误。 |
| `failed` | 任务失败。 |
| `cancelled` | 取消。第一版可不实现取消接口。 |

第一版可以由 API process 同步执行，不必先引入 worker/queue。即使同步执行，也要以 job 记录表达状态和结果。

### 6.2 `GET /api/admin/import-jobs`

Permission：`import_job:read`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `status` | enum | optional |
| `createdBy` | uuid | optional |
| `limit` | integer | 20 |
| `offset` | integer | 0 |

Response：

```json
{
  "jobs": [
    {
      "id": "job-uuid",
      "kind": "full_corpus_import",
      "status": "succeeded",
      "sourceDir": "C:\\path\\to\\questionbank",
      "createdBy": { "id": "admin-user-uuid", "displayName": "运营管理员" },
      "createdAt": "2026-07-13T09:00:00.000Z",
      "startedAt": "2026-07-13T09:00:05.000Z",
      "finishedAt": "2026-07-13T09:02:27.000Z",
      "progress": {
        "phase": "done",
        "current": 89922,
        "total": 89922
      },
      "summary": {
        "classifications": 2941,
        "questions": 89922,
        "options": 154899,
        "skippedOptions": 25424,
        "bankMappings": 2662
      }
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

### 6.3 `POST /api/admin/import-jobs`

Permission：`import_job:create`

Request：

```json
{
  "kind": "full_corpus_import",
  "sourceDir": "C:\\Users\\Bot\\Bot\\BKYExam\\Monitor\\questionbank",
  "mode": "dry_run",
  "options": {
    "batchSize": 1000,
    "resetBeforeImport": false,
    "generateMappings": true
  }
}
```

Allowed values：

```text
kind: full_corpus_import
mode: dry_run | import
```

Response：

```json
{
  "job": {
    "id": "job-uuid",
    "kind": "full_corpus_import",
    "status": "queued",
    "sourceDir": "C:\\Users\\Bot\\Bot\\BKYExam\\Monitor\\questionbank",
    "createdAt": "2026-07-13T09:00:00.000Z"
  }
}
```

Rules：

- 同一时间只允许一个 `full_corpus_import` job running。
- 有 running job 时返回 `409`。
- `sourceDir` 第一版只允许服务端 allowlist 路径，不能任意读文件系统。
- `resetBeforeImport=true` 是高风险操作，只允许 `super_admin`。

Audit action：

```text
import_job.create
```

### 6.4 `GET /api/admin/import-jobs/:id`

Permission：`import_job:read`

Response：

```json
{
  "job": {
    "id": "job-uuid",
    "kind": "full_corpus_import",
    "status": "succeeded",
    "sourceDir": "C:\\path\\to\\questionbank",
    "mode": "import",
    "options": { "batchSize": 1000, "resetBeforeImport": false },
    "progress": { "phase": "done", "current": 89922, "total": 89922 },
    "summary": {
      "classifications": 2941,
      "questions": 89922,
      "rawOptions": 180323,
      "options": 154899,
      "skippedOptions": 25424,
      "bankMappings": 2662
    },
    "errorSummary": [],
    "createdBy": { "id": "admin-user-uuid", "displayName": "运营管理员" },
    "createdAt": "2026-07-13T09:00:00.000Z",
    "startedAt": "2026-07-13T09:00:05.000Z",
    "finishedAt": "2026-07-13T09:02:27.000Z"
  }
}
```

## 7. Workflow D — Question Review

### 7.1 不直接编辑原题

第一版只建立 flag/override 层，不修改 `questions.content`、`questions.answer_raw` 或 `question_options`。

原因：

- 下次导入可能覆盖原题。
- 直接编辑会失去 source provenance。
- 各题型编辑器复杂度高。

### 7.2 Flag Types

| Flag | 语义 |
| --- | --- |
| `bad_answer` | 参考答案疑似错误。 |
| `missing_option` | 选项缺失。 |
| `bad_option` | 选项内容异常。 |
| `garbled_content` | 乱码/HTML/格式异常。 |
| `duplicate_question` | 重复题。 |
| `wrong_type` | 题型识别错误。 |
| `needs_manual_review` | 需要人工进一步确认。 |

Severity：

```text
low | medium | high | blocking
```

Status：

```text
open | resolved | ignored
```

### 7.3 `GET /api/admin/question-review`

Permission：`question_review:read`

Query：

| Query | Type | Notes |
| --- | --- | --- |
| `bankId` | uuid | optional |
| `questionType` | string | optional |
| `flagType` | enum | optional |
| `status` | enum | default open |
| `severity` | enum | optional |
| `keyword` | string | search question content |
| `limit` | integer | default 20, max 100 |
| `offset` | integer | default 0 |

Response：

```json
{
  "questions": [
    {
      "questionId": "question-uuid",
      "bankId": "bank-uuid",
      "bankName": "C++ 程序设计题库",
      "questionType": "single_choice",
      "contentPreview": "下列关于数组初始化的说法...",
      "optionCount": 4,
      "answerPreview": "A",
      "flags": [
        {
          "id": "flag-uuid",
          "type": "bad_answer",
          "severity": "high",
          "status": "open",
          "note": "答案与解析不一致",
          "createdAt": "2026-07-13T09:00:00.000Z",
          "createdBy": { "id": "admin-user-uuid", "displayName": "内容编辑" }
        }
      ],
      "excludedFromPractice": true
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

### 7.4 `PATCH /api/admin/question-review/:questionId`

Permission：`question_review:write`

Request：

```json
{
  "addFlags": [
    {
      "type": "bad_answer",
      "severity": "high",
      "note": "参考答案与解析不一致"
    }
  ],
  "resolveFlagIds": ["flag-uuid-to-resolve"],
  "ignoredFlagIds": [],
  "excludedFromPractice": true
}
```

Response：

```json
{
  "question": {
    "questionId": "question-uuid",
    "bankId": "bank-uuid",
    "flags": [],
    "excludedFromPractice": true
  }
}
```

Audit actions：

```text
question_review.flag_add
question_review.flag_resolve
question_review.exclude_update
```

Student API impact：

- 第一版可以只记录 flag，不立即影响学生端。
- 如果实现 `excludedFromPractice=true`，Practice 创建 session 时必须排除 blocking/open flagged question。
- 是否排除需在 B5 实现前明确，避免学生题量突然变化。

## 8. Workflow E — System Status

### 8.1 `GET /api/admin/system/status`

Permission：`system_status:read`

Response：

```json
{
  "api": {
    "ok": true,
    "service": "bkyexam-practice-api",
    "version": "0.1.0"
  },
  "database": {
    "ok": true,
    "migrationCount": 4,
    "currentMigration": "0004_practice_session_history.sql"
  },
  "corpus": {
    "classifications": 2941,
    "questions": 89922,
    "questionOptions": 154899,
    "bankMappings": 2662,
    "visibleBanks": 473
  },
  "imports": {
    "tableExists": false,
    "runningJobId": null,
    "lastJob": null
  },
  "quality": {
    "tableExists": false,
    "openFlags": 0,
    "blockingFlags": 0,
    "excludedQuestions": 0
  }
}
```

Notes：

- 这是 admin system status，不替代 public `/api/health`。
- DB readiness 细节只对管理员暴露。

## 9. Optional Workflow — Audit Log Read

写 audit log 是 B5 必做；读 audit log 可以作为 B5 后半或 B6。

### `GET /api/admin/audit-logs`

Permission：`audit_log:read`

Query：

| Query | Type |
| --- | --- |
| `actorAdminId` | uuid optional |
| `action` | string optional |
| `resourceType` | string optional |
| `resourceId` | string optional |
| `from` | ISO datetime optional |
| `to` | ISO datetime optional |
| `limit` | 1..100 |
| `offset` | >=0 |

Response：

```json
{
  "auditLogs": [
    {
      "id": "audit-log-uuid",
      "actor": { "id": "admin-user-uuid", "displayName": "内容编辑" },
      "action": "bank_mapping.update",
      "resourceType": "bank_mapping",
      "resourceId": "bank-uuid",
      "before": { "visible": false, "status": "review" },
      "after": { "visible": true, "status": "active" },
      "createdAt": "2026-07-13T09:00:00.000Z"
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

## 10. Database Design For B5

### 10.1 Required migrations

当前 B5 migration 已按切片落地：

```text
0005_admin_foundation.sql
0006_import_jobs.sql
0007_question_quality_flags.sql
```

其中 `0005_admin_foundation.sql` 包含：

```sql
admin_users
admin_sessions
admin_user_roles
audit_logs
bank_mappings.version
bank_mappings.updated_at
bank_mappings.updated_by_admin_id
```

后续 migration 应继续按小切片追加，不在同一阶段混入 UI 或大规模数据重写。

### 10.2 `admin_users`

```sql
CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
```

### 10.3 `admin_sessions`

```sql
CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
```

### 10.4 `admin_user_roles`

```sql
CREATE TABLE admin_user_roles (
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('content_editor', 'operator', 'super_admin')),
  PRIMARY KEY (admin_user_id, role)
);
```

第一版不必建 `admin_permissions` 表，permissions 可以由 role 在代码中推导。

### 10.5 `audit_logs`

```sql
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid REFERENCES admin_users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure')),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Indexes：

```sql
CREATE INDEX audit_logs_actor_created_at_idx ON audit_logs(actor_admin_id, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX audit_logs_action_created_at_idx ON audit_logs(action, created_at DESC);
```

### 10.6 `bank_mappings` additions

```sql
ALTER TABLE bank_mappings
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by_admin_id uuid REFERENCES admin_users(id);
```

Update rule：

```sql
WHERE bank_id = $1 AND version = $expectedVersion
SET ..., version = version + 1, updated_at = now(), updated_by_admin_id = $adminId
```

### 10.7 `import_jobs`

```sql
CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('full_corpus_import')),
  mode text NOT NULL CHECK (mode IN ('dry_run', 'import')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  source_dir text NOT NULL,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_admin_id uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
```

Recommended indexes：

```sql
CREATE INDEX import_jobs_status_created_at_idx ON import_jobs(status, created_at DESC);
CREATE INDEX import_jobs_created_by_idx ON import_jobs(created_by_admin_id, created_at DESC);
```

### 10.8 `question_quality_flags`

```sql
CREATE TABLE question_quality_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  bank_id uuid REFERENCES classifications(id),
  flag_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'blocking')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  note text NOT NULL DEFAULT '',
  excluded_from_practice boolean NOT NULL DEFAULT false,
  created_by_admin_id uuid REFERENCES admin_users(id),
  resolved_by_admin_id uuid REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
```

Recommended indexes：

```sql
CREATE INDEX question_quality_flags_question_id_idx ON question_quality_flags(question_id);
CREATE INDEX question_quality_flags_bank_status_idx ON question_quality_flags(bank_id, status);
CREATE INDEX question_quality_flags_type_status_idx ON question_quality_flags(flag_type, status);
```

## 11. Service Boundaries

推荐后端结构：

```text
apps/api/src/modules/admin/
  contracts.ts
  authService.ts
  authRepository.ts
  sessionService.ts
  rbac.ts
  auditService.ts
  auditRepository.ts
  routes.ts

apps/api/src/modules/catalog/
  bankMappingAdminService.ts
  bankMappingAdminRepository.ts

apps/api/src/modules/importJobs/
  importJobService.ts
  importJobRepository.ts
  importRunner.ts

apps/api/src/modules/questionReview/
  questionReviewService.ts
  questionReviewRepository.ts
```

Rules：

- Admin routes 不直接写 SQL。
- Admin service 调 Catalog/Import/QuestionReview service。
- Audit service 由写操作 service 调用，而不是 route 手写。
- Import runner 可以先同步执行，但状态必须通过 `import_jobs` 表反映。

## 12. B5 建议实现顺序

### B5.1 Admin Identity + RBAC + Audit Foundation

状态：**已完成，2026-07-13。**

交付：

- migration `0005_admin_foundation.sql`
- admin auth repository/service/session
- RBAC helper
- audit service
- `POST /api/admin/auth/login`
- `GET /api/admin/me`
- `POST /api/admin/auth/logout`
- route tests + PG integration extension

### B5.2 Bank Mapping Read APIs

状态：**已完成，2026-07-13。**

交付：

- `GET /api/admin/bank-mappings`
- `GET /api/admin/bank-mappings/:bankId`
- shared admin bank mapping schemas
- list/detail tests

### B5.3 Bank Mapping Write APIs

状态：**已完成，2026-07-13。**

交付：

- `PATCH /api/admin/bank-mappings/:bankId`
- `POST /api/admin/bank-mappings/bulk-status`
- version conflict tests
- audit log tests
- student `/api/banks` 不暴露 hidden/review 回归

### B5.4 System Status

状态：**已完成，2026-07-13。**

交付：

- `GET /api/admin/system/status`
- corpus counts
- visible bank count
- latest import job if table exists
- DB readiness check

### B5.5 Import Jobs

状态：**已完成，2026-07-13。**

交付：

- migration `0006_import_jobs.sql`
- `GET /api/admin/import-jobs`
- `POST /api/admin/import-jobs`
- `GET /api/admin/import-jobs/:id`
- running lock
- dry-run mode first；真实写入 import mode 仍保留但返回 `422`，等待后续显式开启
- `ADMIN_IMPORT_ALLOWED_ROOTS` source allowlist
- `resetBeforeImport=true` 需要 `super_admin`
- `import_job.create` audit log
- System Status 可读取 latest import job

### B5.6 Question Review Flags

状态：**已完成，2026-07-14。**

交付：

- migration `0007_question_quality_flags.sql`
- `GET /api/admin/question-review`
- `PATCH /api/admin/question-review/:questionId`
- practice exclusion rule behind explicit tests
- `question_review.flag_add` / `question_review.flag_resolve` / `question_review.exclude_update` audit log
- System Status quality summary 接入真实表

## 13. Acceptance Criteria For B5

B5 完成时必须满足：

- 管理员可以登录、恢复 session、退出。
- 管理 API 和学生 API session 彼此隔离。
- 非管理员访问 `/api/admin/*` 返回 `401`。
- 缺少权限返回 `403`。
- 管理员可以查看题库 mapping。
- 管理员可以编辑并发布/隐藏题库。
- 管理员可以创建 dry-run import job、查看导入任务列表和详情。
- 管理员可以添加/处理题目质量 flag，并用 `excludedFromPractice=true` 排除新练习选题。
- 写操作有 optimistic concurrency。
- 写操作写 audit log。
- 学生 `/api/banks` 只返回已发布可见且含客观题的题库。
- `npm run verify:docker` 通过。
- 文档同步更新。

## 14. Open Questions For Next Stage

B5.1 到 B5.6 已实现；进入正式 Admin UI 前仍需要确认：

1. 初始 `super_admin` 如何创建？
   - 建议下一阶段实现 CLI seed script 或环境变量一次性 bootstrap，不开放 public registration。
2. `sourceDir` allowlist 放在哪里？
   - 已采用环境变量 `ADMIN_IMPORT_ALLOWED_ROOTS`。
3. question quality flag 是否立即影响学生选题？
   - 已固定为 `excludedFromPractice=true` 才影响新建普通练习选题。
4. bank mapping `status=review` 是否应该是导入后的默认状态？
   - 当前自动 mapping 已将可见项设为 active；管理端上线后可考虑新导入先 review。
5. audit log 是否记录失败尝试？
   - 建议记录权限失败以外的业务写入失败；认证失败只进入安全日志/structured log，不进业务 audit。

## 15. One-line Decision

当前仍不应先做正式 Admin UI。Admin identity/RBAC/audit、bank mapping read/write、system status、import jobs dry-run 与 question review flags 已完成，下一步应先补齐非视觉管理能力与信息架构审核：

> **Admin bootstrap / Audit Log read / 管理端信息架构静态审核**

这会把最小可运营闭环从“后端 command/query 可用”推进到“能被真实管理员初始化、追踪和审核”，同时保持正式前端最后设计。
