# API

Base path：`/api`

除 health、login 和当前的 bank list 外，学生业务路由均依赖 `bky_session` Cookie；管理端路由依赖独立的 `bky_admin_session` Cookie。

## Common Conventions

### IDs

真实 PostgreSQL 路径使用 canonical UUID。Practice 新接口要求小写 canonical UUID；Wrongbook 和兼容接口允许大小写 UUID。

### Answer

```ts
type SubmittedAnswer = string[] | boolean | string;
```

- 单选：通常是一个 option ID 的数组。
- 多选：option ID 数组。
- 判断：boolean。
- 其他题型：string，当前通常进入 self-review。

### Error

```json
{
  "error": "Human-readable message",
  "requestId": "optional-request-id"
}
```

手写业务错误目前通常只返回 `error`。未捕获异常和平台 guardrail 错误会额外返回 `requestId`，并且所有响应都会带 `x-request-id` header；客户端传入合法 `x-request-id` 时会复用该值，否则由 Fastify 生成。

常见状态：

- `400`：参数或 body 无效。
- `401`：未登录、session 过期或已撤销。
- `404`：资源不存在、不属于当前学生，或题目不在该 session。
- `409`：尝试修改已经 completed 的 practice session。
- `429`：启用 rate limit 后请求过多。

### Platform Guardrails

所有 API 响应默认附加：

- `x-request-id`
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- `referrer-policy: no-referrer`
- `cross-origin-resource-policy: same-site`

可选 guardrail：

- `RATE_LIMIT_ENABLED=true` 时启用内存级最小 rate limit，默认窗口 `RATE_LIMIT_WINDOW_MS=60000`、上限 `RATE_LIMIT_MAX=600`。
- `CSRF_ORIGIN_CHECK_ENABLED=true` 时，对带 `bky_session` 或 `bky_admin_session` Cookie 的 unsafe method 检查 `Origin`/`Referer`，允许列表来自 `CSRF_ALLOWED_ORIGINS`。

### Versioned Runtime Contract

Practice、Wrongbook、Learning 的成功响应使用 `packages/shared/src/contracts/v1` 中的共享 Zod schema：

- Fastify route 在发送响应前校验 repository/业务编排输出。
- Web 在把响应写入页面状态前再次校验。
- 不合法的服务端成功 payload 被视为内部 contract bug，并 fail closed 为 `500`。

`v1` 当前是代码 schema 命名空间，不会额外出现在 JSON response 中。大多数旧请求路由仍保留手写 parser，以保持现有错误文案和 legacy 行为；session 集合查询已经直接使用共享 request schema，其余路由后续逐步迁移。

关键语义：

- `markedForReview` 与 `currentSort` 在 Practice response 中是 required。
- option ID 是 opaque non-empty string，不保证一定为 UUID。
- `false` 是有效 answer。
- completed session 允许未答题。
- `completedCount` 的 v1 语义固定为 answered/graded questions。
- 旧逐题 submit endpoint 允许并保留大小写 UUID；新 Practice response 使用小写 canonical UUID。

完整 contract、版本规则和已知例外见 [contracts.md](contracts.md)。

## Health

### `GET /api/health`

Response：

```json
{
  "ok": true,
  "service": "bkyexam-practice-api"
}
```

该接口只证明 Fastify 进程可响应，不包含 PostgreSQL readiness。

### `GET /api/health/readiness`

Response when ready：

```json
{
  "ok": true,
  "service": "bkyexam-practice-api",
  "checkedAt": "2026-07-14T10:00:00.000Z",
  "dependencies": {
    "api": {
      "ok": true,
      "status": "ok",
      "latencyMs": 0
    },
    "database": {
      "ok": true,
      "status": "ok",
      "latencyMs": 3
    }
  }
}
```

当 `USE_DATABASE=false` 时，database dependency 返回 `status=disabled` 且整体仍为 ready；当 PostgreSQL `SELECT 1` readiness query 失败时返回 `503`：

```json
{
  "ok": false,
  "service": "bkyexam-practice-api",
  "checkedAt": "2026-07-14T10:00:00.000Z",
  "dependencies": {
    "api": { "ok": true, "status": "ok", "latencyMs": 0 },
    "database": {
      "ok": false,
      "status": "down",
      "latencyMs": 25,
      "message": "Database readiness query failed"
    }
  }
}
```

### `GET /api/health/metrics`

返回当前 API 进程内的最小 HTTP metrics smoke payload。该接口用于部署后快速确认路由计数、状态桶和延迟字段正在增长；它不是最终 Prometheus/alerting 集成。

Response：

```json
{
  "service": "bkyexam-practice-api",
  "generatedAt": "2026-07-15T00:00:00.000Z",
  "uptimeSeconds": 12.345,
  "process": {
    "pid": 12345,
    "nodeVersion": "v24.0.0",
    "memoryRssBytes": 104857600,
    "memoryHeapUsedBytes": 52428800
  },
  "http": {
    "totalRequests": 3,
    "responses": {
      "informational": 0,
      "success": 2,
      "redirection": 0,
      "clientError": 1,
      "serverError": 0
    },
    "averageDurationMs": 2.5,
    "routes": [
      {
        "method": "GET",
        "route": "/api/health",
        "requests": 1,
        "responses": {
          "informational": 0,
          "success": 1,
          "redirection": 0,
          "clientError": 0,
          "serverError": 0
        },
        "averageDurationMs": 1.2
      }
    ]
  }
}
```

该 response 使用 shared v1 `MetricsResponseV1Schema` parse；`/api/health/metrics` 本次请求本身会在 response 发送完成后计入下一次 snapshot。

## Auth

### `POST /api/auth/login`

创建或验证学生身份，并创建服务端 session。

Request：

```json
{
  "loginName": "alice",
  "password": "optional"
}
```

当前 PostgreSQL 实现仍允许首次使用用户名时自动创建学生，这是内部 MVP 行为。正式身份策略已在 [`identity-security-strategy.md`](identity-security-strategy.md) 冻结：后续生产模式将改为管理员批量创建学生，学生用用户名/学号 + 密码登录，旧账号保留但不继续依赖无密码登录。

Response：

```json
{
  "student": {
    "loginName": "202502040201",
    "displayName": "202502040201",
    "className": "2班",
    "groupName": null
  },
  "passwordResetRequired": false
}
```

说明：

- `className/groupName` 是 B9.5 新增的轻量组织字段；未知时为 `null` 或省略。
- `202502040201`–`202502040230` 当前默认归入 `2班`。
- `passwordResetRequired=true` 表示管理员重置或临时密码登录后应先修改密码；修改密码接口仍属于后续 B9.7。

Cookie：

- name：`bky_session`
- `httpOnly=true`
- `sameSite=lax`
- `path=/`
- `secure` 由 `COOKIE_SECURE` 控制
- expiry 与服务端 session 一致

Errors：

- `400`：缺少 `loginName` 或字段类型错误。
- `401`：凭据验证失败。

### `GET /api/auth/me`

返回 Cookie 对应学生。

Response：

```json
{
  "student": {
    "id": "student-uuid",
    "loginName": "alice",
    "displayName": "Alice",
    "className": null,
    "groupName": null
  },
  "passwordResetRequired": false
}
```

Errors：

- `401`：Cookie 缺失、过期、无效或已撤销。

### `POST /api/auth/logout`

撤销当前服务端 session 并清除 Cookie。没有当前 session 时仍返回成功。

Response：

```json
{
  "success": true
}
```

## Admin Auth

Admin Auth 是 B5.1 已实现的第一组 `/api/admin/*` route。管理员 session 与学生 session 完全隔离：学生 Cookie 不能访问 Admin API，Admin Cookie 不能访问学生 `/api/auth/me`。

### `POST /api/admin/auth/login`

验证管理员凭据，创建 `bky_admin_session`，并写入 `admin.auth.login` audit log。

Request：

```json
{
  "loginName": "operator@example.com",
  "password": "secret"
}
```

Response：

```json
{
  "admin": {
    "id": "admin-user-uuid",
    "loginName": "operator@example.com",
    "displayName": "Operator",
    "roles": ["operator"],
    "permissions": ["admin:self:read", "bank_mapping:read", "import_job:read", "import_job:create", "system_status:read", "student_account:read", "student_account:write", "student_account:reset_password", "student_account:revoke_session"]
  },
  "expiresAt": "2026-07-13T18:00:00.000Z"
}
```

Errors：

- `400`：请求体无效，或缺少 password。
- `401`：凭据错误。
- `403`：管理员账号已禁用。

### `GET /api/admin/me`

返回当前管理员和权限。需要 `bky_admin_session` 和 `admin:self:read`。

Errors：

- `401`：Cookie 缺失、过期、无效或已撤销。
- `403`：管理员 session 有效但缺少权限。

### `POST /api/admin/auth/logout`

撤销当前管理员 session、清除 `bky_admin_session`，并在有当前管理员时写入 `admin.auth.logout` audit log。没有当前 session 时仍返回成功。

Response：

```json
{
  "success": true
}
```

## Admin Users

Admin User manage API 是 B5.8 已实现的管理员账号生命周期后端。它只允许拥有 `admin_user:manage` 的 `super_admin` 使用，不开放 public registration。

所有响应都不返回 password 或 passwordHash；创建/修改密码只通过 write request 进入服务端 hash。系统会阻止禁用或移除最后一个 active `super_admin`。

### `GET /api/admin/users`

Permission：`admin_user:manage`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `status` | `active|disabled` | optional |
| `role` | `content_editor|operator|super_admin` | optional |
| `keyword` | string | optional |
| `limit` | integer 1..100 | 20 |
| `offset` | integer >= 0 | 0 |

Response：

```json
{
  "adminUsers": [
    {
      "id": "admin-user-uuid",
      "loginName": "operator@example.com",
      "displayName": "Operator",
      "status": "active",
      "roles": ["operator"],
      "permissions": ["admin:self:read", "bank_mapping:read", "import_job:read", "import_job:create", "system_status:read", "student_account:read", "student_account:write", "student_account:reset_password", "student_account:revoke_session"],
      "createdAt": "2026-07-14T10:00:00.000Z",
      "updatedAt": "2026-07-14T10:00:00.000Z",
      "lastLoginAt": null
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

### `GET /api/admin/users/:adminId`

Permission：`admin_user:manage`

Response：

```json
{
  "adminUser": {
    "id": "admin-user-uuid",
    "loginName": "operator@example.com",
    "displayName": "Operator",
    "status": "active",
    "roles": ["operator"],
    "permissions": ["admin:self:read", "bank_mapping:read", "import_job:read", "import_job:create", "system_status:read", "student_account:read", "student_account:write", "student_account:reset_password", "student_account:revoke_session"],
    "createdAt": "2026-07-14T10:00:00.000Z",
    "updatedAt": "2026-07-14T10:00:00.000Z",
    "lastLoginAt": null
  }
}
```

### `POST /api/admin/users`

Permission：`admin_user:manage`

Request：

```json
{
  "loginName": "operator@example.com",
  "displayName": "Operator",
  "password": "secret123",
  "roles": ["operator"]
}
```

Rules：

- `password` 最少 8 个字符。
- `roles` 至少 1 个，最多 3 个，不能重复。
- `loginName` 冲突返回 `409`。
- 成功写 `admin_user.create` audit log。

### `PATCH /api/admin/users/:adminId`

Permission：`admin_user:manage`

Request 至少包含一个字段：

```json
{
  "displayName": "Content Editor",
  "status": "active",
  "roles": ["content_editor"],
  "password": "newsecret123"
}
```

Rules：

- `roles` 不能重复。
- `password` 出现时最少 8 个字符。
- 禁用最后一个 active `super_admin`，或移除最后一个 active `super_admin` 的 `super_admin` role，返回 `409`。
- 成功写 `admin_user.update` audit log，metadata 包含 `passwordChanged`。

Errors：

- `400`：query、body 或 admin id 无效。
- `401`：缺少有效 `bky_admin_session`。
- `403`：缺少 `admin_user:manage`。
- `404`：admin user 不存在。
- `409`：loginName 冲突，或试图禁用/移除最后一个 active `super_admin`。

## Admin Students

Admin Student Manage API 是 B9.6 已实现的学生账号生命周期后端。它不开放公网自助注册；学生账号由管理员单个创建或批量创建，使用 `loginName` + 密码登录。所有响应都不返回 `password` 或 `passwordHash`。

角色/权限：

- `operator`：具备 `student_account:read/write/reset_password/revoke_session`，用于日常运营批量建号、重置密码和撤销 session。
- `content_editor`：默认没有学生账号权限。
- `super_admin`：拥有全部学生账号权限。

### `GET /api/admin/students`

Permission：`student_account:read`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `status` | `active|disabled` | optional |
| `className` | string | optional |
| `groupName` | string | optional |
| `passwordResetRequired` | boolean | optional |
| `lockedOnly` | boolean | optional |
| `keyword` | string | optional，匹配 `loginName/displayName` |
| `limit` | integer 1..100 | 20 |
| `offset` | integer >= 0 | 0 |

Response：

```json
{
  "students": [
    {
      "id": "student-uuid",
      "loginName": "202502040201",
      "displayName": "Student 201",
      "className": "2班",
      "groupName": null,
      "status": "active",
      "passwordResetRequired": true,
      "passwordChangedAt": null,
      "failedLoginCount": 0,
      "lockedUntil": null,
      "lastLoginAt": null,
      "createdBy": { "id": "admin-user-uuid", "displayName": "Operator" },
      "createdAt": "2026-07-15T10:00:00.000Z",
      "updatedAt": "2026-07-15T10:00:00.000Z"
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

### `GET /api/admin/students/:studentId`

Permission：`student_account:read`

返回单个学生账号详情。不存在返回 `404`。

### `POST /api/admin/students`

Permission：`student_account:write`

Request：

```json
{
  "loginName": "202502040201",
  "displayName": "Student 201",
  "initialPassword": "temporary-password",
  "className": "2班",
  "groupName": null,
  "passwordResetRequired": true
}
```

规则：

- `initialPassword` 至少 8 字符，只进入服务端 hash，不在 response 或 audit 明文返回。
- `displayName` 可省略，默认使用 `loginName`。
- `className` 省略时，`202502040201`–`202502040230` 自动推断为 `2班`；显式传 `null` 可保持为空。
- `loginName` 冲突返回 `409`。
- 成功写 `student_account.create` audit log。

### `POST /api/admin/students/bulk-create`

Permission：`student_account:write`

单次最多 200 个学生。

Request：

```json
{
  "students": [
    {
      "loginName": "202502040201",
      "displayName": "Student 201",
      "className": "2班",
      "groupName": null
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

Response：

```json
{
  "created": [],
  "skipped": [
    { "loginName": "existing-student", "reason": "loginName already exists" }
  ],
  "failed": [
    { "loginName": "duplicate-student", "error": "Duplicate loginName in request" }
  ]
}
```

规则：

- 每个 student 可单独传 `initialPassword`；否则使用 `options.defaultInitialPassword`。
- `skipExisting=true` 时，已存在账号进入 `skipped`；否则进入 `failed`。
- 同一 request 内重复 `loginName` 进入 `failed`，不影响其他项创建。
- 成功写聚合 `student_account.bulk_create` audit log。

### `PATCH /api/admin/students/:studentId`

Permission：`student_account:write`

Request 至少包含一个字段：

```json
{
  "displayName": "Student 201 Updated",
  "status": "disabled",
  "className": "2班",
  "groupName": "A组"
}
```

成功写 `student_account.update` audit log。

### `POST /api/admin/students/:studentId/reset-password`

Permission：`student_account:reset_password`

Request：

```json
{
  "newPassword": "new-temporary-password",
  "revokeExistingSessions": true
}
```

规则：

- `newPassword` 至少 8 字符，只写入 hash。
- 设置 `passwordResetRequired=true`，清空失败计数与临时锁定。
- `revokeExistingSessions=true` 时撤销该学生当前未过期 session。
- 成功写 `student_account.reset_password` audit log，metadata 记录 `revokedSessions`。

### `POST /api/admin/students/:studentId/revoke-sessions`

Permission：`student_account:revoke_session`

撤销该学生当前未过期 session，并返回：

```json
{
  "studentId": "student-uuid",
  "revokedSessions": 1
}
```

成功写 `student_account.revoke_sessions` audit log。

Errors：

- `400`：query、body 或 student id 无效。
- `401`：缺少有效 `bky_admin_session`。
- `403`：缺少对应 `student_account:*` 权限。
- `404`：student 不存在。
- `409`：单个创建时 `loginName` 冲突。

## Admin Bank Mappings

Admin Bank Mapping APIs 是 B5.2/B5.3 已实现的管理端题库整理模型。读接口查看 `bank_mappings` 与统计数据；写接口覆盖运营字段、发布/隐藏状态、乐观并发控制和 audit log。

### `GET /api/admin/bank-mappings`

Permission：`bank_mapping:read`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `status` | `review|active|hidden|deprecated` | optional |
| `visible` | `true|false` | optional |
| `subjectCategory` | string | optional |
| `subjectName` | string | optional |
| `keyword` | string | optional |
| `qGroup` | integer | optional |
| `parentId` | UUID | optional |
| `hasObjectiveQuestions` | `true|false` | optional |
| `limit` | integer 1..100 | 20 |
| `offset` | integer >= 0 | 0 |

Response：

```json
{
  "bankMappings": [
    {
      "bankId": "bank-uuid",
      "rawName": "数据库集成测试题库",
      "bankName": "数据库集成测试题库",
      "subjectCategory": "质量保障",
      "subjectName": "PostgreSQL",
      "parentId": null,
      "qGroup": 100,
      "visible": true,
      "status": "active",
      "difficulty": "mixed",
      "examPurpose": "integration",
      "questionTypes": ["single_choice", "multiple_choice", "yes_no"],
      "audience": "developers",
      "keywords": ["integration", "postgres"],
      "description": "用于真实 PostgreSQL integration profile 的最小题库。",
      "notes": "",
      "questionCount": 4,
      "descendantQuestionCount": 4,
      "objectiveQuestionCount": 4,
      "version": 1,
      "updatedAt": "2026-07-13T10:00:00.000Z",
      "updatedBy": null
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

### `GET /api/admin/bank-mappings/:bankId`

Permission：`bank_mapping:read`

Response：

```json
{
  "bankMapping": {
    "...": "same fields as list item",
    "parentName": null,
    "questionTypeCounts": {
      "single_choice": 2,
      "multiple_choice": 1,
      "yes_no": 1
    },
    "studentPreview": {
      "visibleInStudentCatalog": true,
      "reason": "visible active bank with objective questions"
    }
  }
}
```

Errors：

- `400`：query 或 bank id 无效。
- `401`：缺少有效 `bky_admin_session`。
- `403`：管理员缺少 `bank_mapping:read`。
- `404`：mapping 不存在。

### `PATCH /api/admin/bank-mappings/:bankId`

Permission：

- `bank_mapping:write`：修改 metadata 字段。
- `bank_mapping:publish`：请求包含 `visible` 或 `status` 时必须具备。

Request：

```json
{
  "expectedVersion": 1,
  "changes": {
    "bankName": "C++ 程序设计题库",
    "subjectCategory": "信息技术",
    "subjectName": "C++",
    "visible": true,
    "status": "active",
    "difficulty": "mixed",
    "examPurpose": "exam",
    "audience": "beginner",
    "keywords": ["C++", "机考"],
    "description": "面向 C++ 程序设计课程的客观题练习。",
    "notes": "人工确认"
  }
}
```

Response：

```json
{
  "bankMapping": {
    "...": "same shape as detail",
    "version": 2,
    "updatedBy": {
      "id": "admin-user-uuid",
      "displayName": "内容编辑"
    }
  }
}
```

Errors：

- `400`：bank id 或 request body 无效；`changes` 不能为空。
- `401`：缺少有效 `bky_admin_session`。
- `403`：缺少 `bank_mapping:write` 或发布相关的 `bank_mapping:publish`。
- `404`：mapping 不存在。
- `409`：`expectedVersion` 与当前版本不一致。
- `422`：试图让无客观题题库变为 `visible=true` 且 `status=active`。

成功写入会将 `version` 加一、刷新 `updatedAt/updatedBy`，并写入 `bank_mapping.update` audit log。

### `POST /api/admin/bank-mappings/bulk-status`

Permission：`bank_mapping:publish`

Request：

```json
{
  "items": [
    { "bankId": "10000000-0000-4000-8000-000000000001", "expectedVersion": 1 }
  ],
  "changes": {
    "visible": false,
    "status": "hidden"
  }
}
```

Response：

```json
{
  "updated": [
    { "bankId": "10000000-0000-4000-8000-000000000001", "version": 2 }
  ],
  "failed": [
    {
      "bankId": "10000000-0000-4000-8000-000000000002",
      "error": "Bank mapping version conflict"
    }
  ]
}
```

Rules：

- 单次最多 100 个 bank。
- 支持部分成功。
- 每个成功项独立写 `bank_mapping.update` audit log。
- 单项失败会进入 `failed`，不影响其他项。

## Admin Import Jobs

Admin Import Jobs 是 B5.5/B5.8/B5.9 已实现的导入任务后端。`mode=dry_run` 会同步解析指定 source directory、生成导入摘要并写入 `import_jobs`；B5.8 增加错误报告读取接口；B5.9 增加受环境变量保护的 true import mode。

运行时必须配置 `ADMIN_IMPORT_ALLOWED_ROOTS`（分号分隔路径列表）。请求的 `sourceDir` 必须位于 allowlist 内。`mode=import` 只有在 `USE_DATABASE=true` 且 `ADMIN_IMPORT_ENABLE_WRITE=true` 时才启用；否则返回 `422`。即使开启 true import，`resetBeforeImport=true` 仍被显式禁止并返回 `422`，当前只允许幂等 upsert 导入。

### `GET /api/admin/import-jobs`

Permission：`import_job:read`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `status` | `queued|running|succeeded|failed|cancelled` | optional |
| `createdBy` | UUID | optional |
| `limit` | integer 1..100 | 20 |
| `offset` | integer >= 0 | 0 |

Response：

```json
{
  "jobs": [
    {
      "id": "import-job-uuid",
      "kind": "full_corpus_import",
      "mode": "dry_run",
      "status": "succeeded",
      "sourceDir": "C:\\questionbank",
      "options": {
        "batchSize": 1000,
        "resetBeforeImport": false,
        "generateMappings": true
      },
      "progress": { "phase": "done", "current": 89922, "total": 89922 },
      "summary": {
        "classifications": 2941,
        "questions": 89922,
        "rawOptions": 180323,
        "options": 154899,
        "skippedOptions": 25424,
        "bankMappings": 2662,
        "questionTypes": { "single_choice": 30980 }
      },
      "errorSummary": [],
      "createdBy": { "id": "admin-user-uuid", "displayName": "Operator" },
      "createdAt": "2026-07-13T10:00:00.000Z",
      "startedAt": "2026-07-13T10:00:00.000Z",
      "finishedAt": "2026-07-13T10:00:01.000Z"
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

### `POST /api/admin/import-jobs`

Permission：`import_job:create`

Request：

```json
{
  "kind": "full_corpus_import",
  "mode": "dry_run",
  "sourceDir": "C:\\questionbank",
  "options": {
    "batchSize": 1000,
    "resetBeforeImport": false,
    "generateMappings": true
  }
}
```

Rules：

- 同一 `kind` 同时只能有一个 `running` job；冲突返回 `409`。
- `sourceDir` 必须在 `ADMIN_IMPORT_ALLOWED_ROOTS` 内；否则返回 `403`。
- `resetBeforeImport=true` 必须由 `super_admin` 执行；否则返回 `403`。
- `mode=import` 默认关闭；只有 `ADMIN_IMPORT_ENABLE_WRITE=true` 且服务端连接 PostgreSQL 时才写入。
- `mode=import` 复用导入器事务，写入 classifications/questions/question_options/bank_mappings，并保持幂等 upsert；`generateMappings=false` 时跳过 bank_mappings 生成。
- `mode=import` 中 `resetBeforeImport=true` 仍返回 `422`：`resetBeforeImport is not enabled for import mode yet`。
- 成功创建后写 `import_job.create` audit log；dry-run 或 import 过程中解析/写入失败会把 job 标为 `failed` 并返回失败摘要，写入失败由导入事务回滚。

### `GET /api/admin/import-jobs/:jobId`

Permission：`import_job:read`

Response：

```json
{
  "job": {
    "...": "same shape as list item"
  }
}
```

### `GET /api/admin/import-jobs/:jobId/errors`

Permission：`import_job:read`

Response：

```json
{
  "jobId": "import-job-uuid",
  "status": "failed",
  "errorSummary": [
    {
      "message": "source file malformed",
      "path": "q.txt"
    }
  ]
}
```

说明：第一版返回 job 当前保存的 `errorSummary`；额外字段允许透传，便于后续按文件/行号扩展。不存在 job 返回 `404`。

Errors：

- `400`：query、body 或 job id 无效。
- `401`：缺少有效 `bky_admin_session`。
- `403`：缺少 `import_job:read/create`、sourceDir 不在 allowlist，或非 super_admin 使用 `resetBeforeImport`。
- `404`：job 不存在。
- `409`：同类 job 已在运行。
- `422`：请求 `mode=import` 但 `ADMIN_IMPORT_ENABLE_WRITE` 未开启，或 true import 请求 `resetBeforeImport=true`。

## Admin Question Review

Admin Question Review 是 B5.6 已实现的题目质检后端。第一版只建立 flag/override 层，不直接编辑 `questions.content`、`questions.answer_raw` 或 `question_options`。当 `excludedFromPractice=true` 时，新的学生练习选题会排除该题；已经创建并锁题的旧 session 不回写改变。

### `GET /api/admin/question-review`

Permission：`question_review:read`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `bankId` | UUID | optional |
| `questionType` | string | optional |
| `flagType` | `bad_answer|missing_option|bad_option|garbled_content|duplicate_question|wrong_type|needs_manual_review` | optional |
| `status` | `open|resolved|ignored` | `open` |
| `severity` | `low|medium|high|blocking` | optional |
| `keyword` | string | optional |
| `limit` | integer 1..100 | 20 |
| `offset` | integer >= 0 | 0 |

Response：

```json
{
  "questions": [
    {
      "questionId": "question-uuid",
      "bankId": "bank-uuid",
      "bankName": "数据库集成测试题库",
      "questionType": "single_choice",
      "contentPreview": "PostgreSQL 中哪个命令用于提交当前事务？",
      "optionCount": 2,
      "answerPreview": "COMMIT",
      "flags": [
        {
          "id": "flag-uuid",
          "type": "bad_answer",
          "severity": "blocking",
          "status": "open",
          "note": "答案与解析不一致",
          "createdAt": "2026-07-14T10:00:00.000Z",
          "createdBy": { "id": "admin-user-uuid", "displayName": "内容编辑" },
          "resolvedAt": null,
          "resolvedBy": null
        }
      ],
      "excludedFromPractice": true
    }
  ],
  "page": { "limit": 20, "offset": 0, "hasMore": false }
}
```

### `PATCH /api/admin/question-review/:questionId`

Permission：`question_review:write`

Request：

```json
{
  "addFlags": [
    {
      "type": "bad_answer",
      "severity": "blocking",
      "note": "答案与解析不一致"
    }
  ],
  "resolveFlagIds": [],
  "ignoredFlagIds": [],
  "excludedFromPractice": true
}
```

Rules：

- `addFlags` 单次最多 20 个。
- `resolveFlagIds` / `ignoredFlagIds` 单次最多各 100 个。
- 同一个 flag id 不能同时 resolved 和 ignored。
- 空变更返回 `400`。
- flag 不属于该 question 或不存在时返回 `404`。
- 成功写入 audit log：
  - `question_review.flag_add`
  - `question_review.flag_resolve`
  - `question_review.exclude_update`

Response：

```json
{
  "question": {
    "...": "same shape as list item"
  }
}
```

Errors：

- `400`：query、body 或 question id 无效。
- `401`：缺少有效 `bky_admin_session`。
- `403`：缺少 `question_review:read/write`。
- `404`：question 或 flag 不存在。

## Admin Audit Logs

Admin Audit Logs 是 B5.7 已实现的审计查询后端。写入仍由各管理写操作负责；读接口只提供管理端追踪、排障和审核使用，不面向学生端。

### `GET /api/admin/audit-logs`

Permission：`audit_log:read`

Query：

| Query | Type | Notes |
| --- | --- | --- |
| `actorAdminId` | uuid optional | 按管理员过滤。 |
| `action` | string optional | 例如 `bank_mapping.update`、`import_job.create`、`question_review.flag_add`、`admin_user.bootstrap`。 |
| `resourceType` | string optional | 例如 `bank_mapping`、`import_job`、`question`、`admin_user`。 |
| `resourceId` | string optional | 资源 ID 或稳定资源标识。 |
| `result` | `success | failure` optional | 按操作结果过滤。 |
| `createdFrom` | ISO datetime optional | inclusive。 |
| `createdTo` | ISO datetime optional | inclusive。 |
| `limit` | integer 1..100 | 默认 20。 |
| `offset` | integer >=0 | 默认 0。 |

Response：

```json
{
  "auditLogs": [
    {
      "id": "90000000-0000-4000-8000-000000000001",
      "actor": {
        "id": "50000000-0000-4000-8000-000000000001",
        "loginName": "operator@example.com",
        "displayName": "Operator"
      },
      "action": "bank_mapping.update",
      "resourceType": "bank_mapping",
      "resourceId": "10000000-0000-4000-8000-000000000001",
      "before": { "visible": false, "status": "review" },
      "after": { "visible": true, "status": "active" },
      "metadata": { "ip": "127.0.0.1" },
      "result": "success",
      "createdAt": "2026-07-14T10:00:00.000Z"
    }
  ],
  "page": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

Rules：

- 按 `createdAt DESC, id DESC` 排序。
- 使用 `limit + 1` 判断 `hasMore`，不计算 total count。
- `actor=null` 表示系统/匿名动作，例如初始 `admin_user.bootstrap`。
- response 使用 `AdminAuditLogListResponseV1Schema` fail closed。

Errors：

- `401`：没有 `bky_admin_session`。
- `403`：缺少 `audit_log:read`。
- `400`：query 不合法。

## Admin Bootstrap

Admin Bootstrap 是 B5.7 已实现的 CLI 入口，用于创建第一个 `super_admin`。它不是 HTTP API，也不会开放 public registration。

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/bkyexam_practice"
$env:ADMIN_BOOTSTRAP_LOGIN_NAME="root@example.com"
$env:ADMIN_BOOTSTRAP_DISPLAY_NAME="Root Admin"
$env:ADMIN_BOOTSTRAP_PASSWORD="<8+ chars password>"
npm run admin:bootstrap
```

Rules：

- 只在还没有任何 `super_admin` 时创建。
- 如果已存在 `super_admin`，命令返回 `already_bootstrapped` 并以非 0 退出码结束。
- 如果 loginName 已被非 super admin 占用，返回 `login_name_conflict`。
- 密码只写入 scrypt hash；输出和 audit log 不包含明文密码。
- 成功后写入 `admin_user.bootstrap` audit log。

## Admin System Status

### `GET /api/admin/system/status`

Permission：`system_status:read`

这是管理端内部状态接口，不替代公开 `/api/health`。它会暴露 PostgreSQL readiness、当前 migration 文件摘要、语料规模、学生可见题库数量、Import Job 简要状态和 Question Review 质量摘要。

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
    "migrationCount": 10,
    "currentMigration": "0010_student_identity_security.sql"
  },
  "corpus": {
    "classifications": 2941,
    "questions": 89922,
    "questionOptions": 154899,
    "bankMappings": 2662,
    "visibleBanks": 473
  },
  "imports": {
    "tableExists": true,
    "runningJobId": null,
    "lastJob": {
      "id": "import-job-uuid",
      "status": "succeeded",
      "finishedAt": "2026-07-13T10:00:01.000Z"
    }
  },
  "quality": {
    "tableExists": true,
    "openFlags": 1,
    "blockingFlags": 1,
    "excludedQuestions": 1
  }
}
```

Notes：

- `visibleBanks` 与学生 `/api/banks` 口径一致：`visible=true`、`status=active` 且含客观题。
- `imports.tableExists=true` 表示 Import Jobs migration 已落地；`lastJob` 是最近创建的导入任务摘要。
- `quality.openFlags` 是 open flag 数量。
- `quality.blockingFlags` 是 open 且 severity 为 `blocking` 的 flag 数量。
- `quality.excludedQuestions` 是当前因 open flag 的 `excludedFromPractice=true` 被新练习选题排除的题目数。

Errors：

- `401`：缺少有效 `bky_admin_session`。
- `403`：管理员缺少 `system_status:read`。

## Banks

### `GET /api/banks`

返回学生可见题库。

Query：

- `category`：精确匹配 `subjectCategory`。
- `keyword`：在题库名、学科、分类和 keywords 中大小写不敏感搜索。

Response：

```json
{
  "banks": [
    {
      "bankId": "bank-uuid",
      "bankName": "2025年C++程序设计",
      "subjectCategory": "信息技术",
      "subjectName": "C++",
      "visible": true,
      "status": "active",
      "keywords": ["C++", "信息技术", "2025"],
      "questionCount": 245,
      "description": "自动映射生成的题库说明"
    }
  ]
}
```

PostgreSQL repository 只返回 `visible=true` 的 mapping。

## Practice DTO

### Session

```json
{
  "id": "session-uuid",
  "bankId": "bank-uuid",
  "mode": "random",
  "questionCount": 70,
  "completedCount": 3,
  "correctCount": 1,
  "currentSort": 6,
  "status": "active"
}
```

字段语义：

- `questionCount`：锁定题目总数。
- `completedCount`：实际已经产生判分/自评结果的题数。
- `correctCount`：自动判定为正确的题数。
- `currentSort`：用于断点续答的 1-based session question position。
- `status`：`active | completed`。

整卷提交允许存在未答题，因此 completed session 的 `completedCount` 可以小于 `questionCount`。

### Question

```json
{
  "id": "question-uuid",
  "sort": 1,
  "type": "single_choice",
  "content": "Question text",
  "options": [
    {
      "id": "option-uuid",
      "sort": 1,
      "content": "Option text"
    }
  ],
  "answered": false,
  "draftAnswer": ["option-uuid"],
  "markedForReview": true,
  "isCorrect": null,
  "correctAnswer": ["option-uuid"],
  "needsSelfReview": false
}
```

字段出现规则：

- active session 可返回 `draftAnswer` 和 `markedForReview`。
- completed/已判分题目可返回 `isCorrect`、`correctAnswer`、`needsSelfReview`。
- 参考答案不会在创建 active session 时提前暴露。

## Practice

所有 Practice 路由需要认证。

### `POST /api/practice/sessions`

创建并锁定一组题目。

Request：

```json
{
  "bankId": "bank-uuid",
  "mode": "random",
  "limit": 70,
  "questionTypes": [
    "single_choice",
    "multiple_choice",
    "yes_no"
  ]
}
```

Defaults：

- `mode=random`
- `limit=70`
- `questionTypes=["single_choice","multiple_choice","yes_no"]`

Validation：

- `limit`：整数 `1..200`
- `questionTypes`：非空字符串数组

Response：

```json
{
  "session": {
    "id": "session-uuid",
    "bankId": "bank-uuid",
    "mode": "random",
    "questionCount": 70,
    "completedCount": 0,
    "correctCount": 0,
    "currentSort": 1,
    "status": "active"
  },
  "questions": []
}
```

真实 response 的 `questions` 包含锁定题目与选项。

Errors：

- `404`：题库不存在或不可见。

### `GET /api/practice/sessions`

返回当前学生的 active 或 completed session 卡片。`status` 必填：

```text
GET /api/practice/sessions?status=active&limit=20&offset=0
GET /api/practice/sessions?status=completed&limit=20&offset=0
```

Query：

- `status`：`active | completed`
- `limit`：整数 `1..50`，默认 `20`
- `offset`：非负整数，默认 `0`

Response：

```json
{
  "sessions": [
    {
      "id": "session-uuid",
      "bankId": "bank-uuid",
      "bankName": "数据库练习题库",
      "origin": "bank",
      "mode": "random",
      "questionCount": 70,
      "answeredCount": 12,
      "correctCount": 0,
      "reviewCount": 2,
      "currentSort": 13,
      "status": "active",
      "createdAt": "2026-07-11T08:00:00.000Z",
      "updatedAt": "2026-07-11T08:20:00.000Z",
      "completedAt": null
    }
  ],
  "page": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

规则：

- active 按 `updatedAt DESC, id DESC`；completed 按 `completedAt DESC, updatedAt DESC, id DESC`。
- `answeredCount` 对 active 会话统计已判定题或具有非空草稿的题；completed 会话使用最终 answered/graded count。
- `origin=bank|wrongbook` 区分普通题库练习和错题再练。
- 草稿保存、清空草稿、存疑切换和位置保存都会刷新 session `updatedAt`。
- API 使用 `limit + 1` 判断 `hasMore`，不为列表执行昂贵 total count。
- response 在 Fastify 和 Web 两侧都由 `PracticeSessionPageV1Schema` 校验。

### `GET /api/practice/sessions/active`

兼容旧客户端的 active session summary endpoint。

Response：

```json
[
  {
    "id": "session-uuid",
    "bankId": "bank-uuid",
    "mode": "random",
    "questionCount": 70,
    "completedCount": 0,
    "correctCount": 0,
    "currentSort": 6,
    "status": "active"
  }
]
```

新学生端不再使用该接口，也不会自动选择第一条 session；首页改用上面的集合 endpoint 展示多个进行中练习。

### `GET /api/practice/sessions/:sessionId`

返回当前学生的 session 与锁定题目：

```json
{
  "session": {},
  "questions": []
}
```

该接口负责恢复：

- current position
- draft answers
- review flags
- completed result details

### `PATCH /api/practice/sessions/:sessionId/progress`

保存当前位置。

Request：

```json
{
  "currentSort": 6
}
```

`currentSort` 必须是整数 `1..200`，并且对应 session 中真实存在的 sort。

Response：更新后的 Session DTO。

### `PUT /api/practice/sessions/:sessionId/drafts/:questionId`

保存或覆盖一道题的草稿。

Request：

```json
{
  "answer": ["option-uuid"]
}
```

Response：更新后的 Question DTO。

空数组通过字段类型验证，但 repository 的整卷提交会把它视为“未作答”。当前 Web 在多选清空时调用 DELETE。

### `DELETE /api/practice/sessions/:sessionId/drafts/:questionId`

清空答案草稿。

- 如果该题仍被标记存疑，保留存疑 row 并将 `draft_answer` 清空。
- 如果没有存疑，删除 draft row。

Response：`204 No Content`

### `PATCH /api/practice/sessions/:sessionId/review/:questionId`

保存存疑状态。

Request：

```json
{
  "markedForReview": true
}
```

Response：更新后的 Question DTO。

存疑是服务端状态，刷新/重新登录后会恢复。

### `POST /api/practice/sessions/:sessionId/submit`

提交整卷，是当前学生端主路径。

Request body 可为空；当前 Web 发送 `{}`。

Response：

```json
{
  "session": {
    "id": "session-uuid",
    "bankId": "bank-uuid",
    "mode": "random",
    "questionCount": 70,
    "completedCount": 3,
    "correctCount": 1,
    "currentSort": 6,
    "status": "completed"
  },
  "results": [
    {
      "questionId": "question-uuid",
      "isCorrect": false,
      "correctAnswer": ["correct-option-uuid"],
      "needsSelfReview": false
    }
  ]
}
```

语义：

- 只处理有有效答案且尚未提交的题。
- 未答题不产生 result/attempt。
- 客观题错误写入 Wrongbook。
- `isCorrect=null` 表示需要自评。
- 成功后 session 永久进入 completed。

Errors：

- `409`：重复提交 completed session。

### `POST /api/practice/sessions/:sessionId/answers`

兼容用逐题提交接口。当前 Web 不以它作为主流程。

Request：

```json
{
  "questionId": "question-uuid",
  "answer": ["option-uuid"]
}
```

Response：

```json
{
  "result": {
    "questionId": "question-uuid",
    "isCorrect": true,
    "correctAnswer": ["option-uuid"],
    "needsSelfReview": false
  },
  "session": {
    "completedCount": 1,
    "correctCount": 1,
    "status": "active"
  }
}
```

该接口会立即写 attempt、更新错题和进度。未来若没有外部调用方，应经过版本化废弃流程移除，避免同时维护两种主语义。

## Learning

所有 Learning 路由需要认证。概览/趋势/目标进度直接从 `practice_sessions`、`practice_attempts`、`wrong_questions`、`questions` 和 `bank_mappings` 聚合；长期复习标记使用 `question_bookmarks` 持久化。它们共同作为学生首页/档案页后续可用的数据 contract。

### `GET /api/learning/dashboard`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `recentLimit` | integer 1..10 | 5 |

Response：

```json
{
  "generatedAt": "2026-07-14T10:00:00.000Z",
  "summary": {
    "activeSessions": 3,
    "completedSessions": 1,
    "reviewSessions": 1,
    "attempts": 3,
    "gradedAttempts": 3,
    "correctAttempts": 2,
    "accuracy": 0.6667,
    "wrongQuestions": 1,
    "masteredWrongQuestions": 1,
    "pendingWrongQuestions": 0,
    "lastPracticedAt": "2026-07-14T09:00:00.000Z"
  },
  "recentBanks": [
    {
      "bankId": "bank-uuid",
      "bankName": "数据库集成测试题库",
      "subjectCategory": "质量保障",
      "subjectName": "PostgreSQL",
      "lastPracticedAt": "2026-07-14T09:00:00.000Z",
      "sessions": 4,
      "completedSessions": 1,
      "attempts": 3,
      "gradedAttempts": 3,
      "correctAttempts": 2,
      "accuracy": 0.6667,
      "wrongQuestions": 1
    }
  ],
  "questionTypes": [
    {
      "questionType": "single_choice",
      "attempts": 1,
      "gradedAttempts": 1,
      "correctAttempts": 1,
      "accuracy": 1,
      "wrongQuestions": 0
    }
  ],
  "wrongbook": {
    "total": 1,
    "mastered": 1,
    "pending": 0,
    "lastWrongAt": "2026-07-14T08:30:00.000Z"
  }
}
```

Rules：

- `attempts` 来自 `practice_attempts`，表示提交后产生的答题记录数。
- `gradedAttempts` 只统计 `is_correct IS NOT NULL` 的记录。
- `accuracy = correctAttempts / gradedAttempts`，无 graded attempt 时为 `null`。
- `reviewSessions` 统计 `origin=wrongbook` 的 practice session。
- `recentBanks` 只返回当前学生创建过 session 的题库，按最近 `practice_sessions.updated_at DESC` 排序。
- `questionTypes` 同时合并 attempt 统计和 wrongbook 统计。

Errors：

- `400`：query 无效。
- `401`：缺少有效 `bky_session`。

### `GET /api/learning/trends`

Query：

| Query | Type | Default |
| --- | --- | --- |
| `days` | integer 7..90 | 14 |

Response：

```json
{
  "generatedAt": "2026-07-14T10:00:00.000Z",
  "fromDate": "2026-07-08",
  "toDate": "2026-07-14",
  "days": 7,
  "daily": [
    {
      "date": "2026-07-08",
      "sessionsStarted": 0,
      "sessionsCompleted": 0,
      "attempts": 0,
      "gradedAttempts": 0,
      "correctAttempts": 0,
      "accuracy": null,
      "wrongQuestionsTouched": 0
    },
    {
      "date": "2026-07-09",
      "sessionsStarted": 0,
      "sessionsCompleted": 0,
      "attempts": 0,
      "gradedAttempts": 0,
      "correctAttempts": 0,
      "accuracy": null,
      "wrongQuestionsTouched": 0
    },
    {
      "date": "2026-07-10",
      "sessionsStarted": 0,
      "sessionsCompleted": 0,
      "attempts": 0,
      "gradedAttempts": 0,
      "correctAttempts": 0,
      "accuracy": null,
      "wrongQuestionsTouched": 0
    },
    {
      "date": "2026-07-11",
      "sessionsStarted": 0,
      "sessionsCompleted": 0,
      "attempts": 0,
      "gradedAttempts": 0,
      "correctAttempts": 0,
      "accuracy": null,
      "wrongQuestionsTouched": 0
    },
    {
      "date": "2026-07-12",
      "sessionsStarted": 0,
      "sessionsCompleted": 0,
      "attempts": 0,
      "gradedAttempts": 0,
      "correctAttempts": 0,
      "accuracy": null,
      "wrongQuestionsTouched": 0
    },
    {
      "date": "2026-07-13",
      "sessionsStarted": 0,
      "sessionsCompleted": 0,
      "attempts": 0,
      "gradedAttempts": 0,
      "correctAttempts": 0,
      "accuracy": null,
      "wrongQuestionsTouched": 0
    },
    {
      "date": "2026-07-14",
      "sessionsStarted": 4,
      "sessionsCompleted": 1,
      "attempts": 3,
      "gradedAttempts": 3,
      "correctAttempts": 2,
      "accuracy": 0.6667,
      "wrongQuestionsTouched": 1
    }
  ],
  "summary": {
    "days": 7,
    "activeDays": 1,
    "currentStreakDays": 1,
    "longestStreakDays": 1,
    "sessionsStarted": 4,
    "sessionsCompleted": 1,
    "attempts": 3,
    "gradedAttempts": 3,
    "correctAttempts": 2,
    "accuracy": 0.6667,
    "wrongQuestionsTouched": 1
  }
}
```

Rules：

- `daily` 使用 UTC 日期桶，长度必须等于 `days`，从 `fromDate` 升序到 `toDate`。
- `sessionsStarted` 按 `practice_sessions.created_at` 的 UTC 日期统计。
- `sessionsCompleted` 按 completed session 的 `completed_at` UTC 日期统计。
- `attempts`、`gradedAttempts`、`correctAttempts` 按 `practice_attempts.created_at` 的 UTC 日期统计。
- `wrongQuestionsTouched` 按 `wrong_questions.last_wrong_at` 的 UTC 日期统计当前错题条目最后一次错误落点。
- `activeDays` 统计任一 bucket 内有 session、attempt 或 wrongbook touch 的天数。
- `currentStreakDays` 从 `toDate` 往前连续 active 的天数；如果 `toDate` 无活动则为 0。
- `longestStreakDays` 是窗口内最长连续 active 天数。
- `accuracy = correctAttempts / gradedAttempts`，无 graded attempt 时为 `null`。

Errors：

- `400`：query 无效。
- `401`：缺少有效 `bky_session`。

### `GET /api/learning/goals`

返回当前学生的学习目标、今日/近 7 日进度和错题复习反馈信号。没有学生自定义目标时返回默认目标：

- `dailyAttemptsTarget = 20`
- `weeklyActiveDaysTarget = 5`
- `wrongQuestionsReviewTarget = 10`

Response：

```json
{
  "generatedAt": "2026-07-14T10:00:00.000Z",
  "goals": {
    "dailyAttemptsTarget": 3,
    "weeklyActiveDaysTarget": 1,
    "wrongQuestionsReviewTarget": 1,
    "source": "student",
    "updatedAt": "2026-07-14T10:00:00.000Z"
  },
  "progress": {
    "today": {
      "date": "2026-07-14",
      "attempts": 3,
      "gradedAttempts": 3,
      "correctAttempts": 2,
      "accuracy": 0.6667,
      "dailyAttempts": {
        "current": 3,
        "target": 3,
        "completed": true,
        "remaining": 0
      }
    },
    "week": {
      "fromDate": "2026-07-08",
      "toDate": "2026-07-14",
      "activeDays": 1,
      "attempts": 3,
      "gradedAttempts": 3,
      "correctAttempts": 2,
      "accuracy": 0.6667,
      "weeklyActiveDays": {
        "current": 1,
        "target": 1,
        "completed": true,
        "remaining": 0
      }
    },
    "wrongbook": {
      "total": 1,
      "mastered": 1,
      "pending": 0,
      "reviewedToday": 0,
      "wrongQuestionsReview": {
        "current": 0,
        "target": 1,
        "completed": true,
        "remaining": 0
      }
    }
  },
  "feedback": [
    {
      "type": "daily_attempts_goal",
      "severity": "success",
      "title": "Daily practice goal reached",
      "message": "Completed 3/3 attempts today.",
      "action": "view_trends"
    }
  ]
}
```

### `PUT /api/learning/goals`

Upsert 当前学生的目标设置，并返回同 `GET /api/learning/goals` 的完整进度响应。

Request：

```json
{
  "dailyAttemptsTarget": 20,
  "weeklyActiveDaysTarget": 5,
  "wrongQuestionsReviewTarget": 10
}
```

Rules：

- 三个字段至少传一个。
- 任一字段可传 `null` 表示关闭该目标。
- `dailyAttemptsTarget`：`1..500`。
- `weeklyActiveDaysTarget`：`1..7`。
- `wrongQuestionsReviewTarget`：`1..100`。
- `reviewedToday` 当前按当天 completed `origin=wrongbook` session 的 `completed_count` 汇总；创建但未提交的错题再练 session 不算复习完成。
- `feedback` 是只读策略信号，第一版只用于提示目标完成、继续练习、错题复习和低正确率关注；不是推荐算法。

Errors：

- `400`：body 无效。
- `401`：缺少有效 `bky_session`。

### `GET /api/learning/review-marks`

列出当前学生收藏或长期复习标记过的题目。该接口只返回题目摘要，不返回完整题干、选项或解析；完整复盘仍应走 Practice/Wrongbook 详情链路。

Query：

| Query | Type | Default |
| --- | --- | --- |
| `bankId` | UUID | optional |
| `kind` | `all|favorite|long_term_review` | `all` |
| `limit` | integer 1..50 | 20 |
| `offset` | integer >= 0 | 0 |

Response：

```json
{
  "reviewMarks": [
    {
      "id": "bookmark-uuid",
      "questionId": "question-uuid",
      "bankId": "bank-uuid",
      "bankName": "数据库集成测试题库",
      "subjectCategory": "质量保障",
      "subjectName": "PostgreSQL",
      "questionType": "multiple_choice",
      "contentPreview": "以下哪些属于 ACID 属性？",
      "favorite": true,
      "longTermReview": true,
      "note": "Review ACID question again.",
      "source": "manual",
      "createdAt": "2026-07-14T10:00:00.000Z",
      "updatedAt": "2026-07-14T10:05:00.000Z"
    }
  ],
  "page": {
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

### `PUT /api/learning/review-marks`

Upsert 当前学生对某题的收藏/长期复习标记。`questionId` 必须属于 `bankId` 指向的题库或其后代分类；同一学生、题目、题库只保留一条标记。

Request：

```json
{
  "questionId": "question-uuid",
  "bankId": "bank-uuid",
  "favorite": true,
  "longTermReview": true,
  "note": "Review ACID question again.",
  "source": "manual"
}
```

Rules：

- `favorite` 和 `longTermReview` 至少一个必须为 `true`。
- `source` 允许 `manual|practice_review|wrongbook`，默认 `manual`。
- `note` 最长 500 字符，默认空字符串。
- 返回体与列表 item 同形，包在 `{ "reviewMark": ... }` 中。

Errors：

- `400`：body 无效，或两个标记都为 `false`。
- `401`：缺少有效 `bky_session`。
- `404`：题目不属于该题库或不存在。

### `DELETE /api/learning/review-marks/:id`

删除当前学生的一条收藏/长期复习标记。

Response：

```json
{ "success": true }
```

Errors：

- `400`：`:id` 不是 UUID。
- `401`：缺少有效 `bky_session`。
- `404`：标记不存在，或不属于当前学生。

## Wrongbook

所有 Wrongbook 路由需要认证。

### `GET /api/wrong-questions`

Query：

- `bankId`：可选 UUID。
- `includeMastered=true`：包含已掌握；其他值均按 false。

Response：

```json
{
  "wrongQuestions": [
    {
      "id": "wrong-question-uuid",
      "questionId": "question-uuid",
      "bankId": "bank-uuid",
      "bankName": "2025年C++程序设计",
      "subjectCategory": "信息技术",
      "subjectName": "C++",
      "questionType": "single_choice",
      "contentPreview": "Question preview",
      "wrongCount": 2,
      "lastAnswer": "[\"option-uuid\"]",
      "mastered": false,
      "lastWrongAt": "2026-07-10T09:00:00.000Z"
    }
  ]
}
```

`lastAnswer` 当前仍是数据库中的序列化字符串。客户端列表不应直接显示可能存在的 UUID；详情可结合 options 映射为可读内容。

### `GET /api/wrong-questions/:id`

返回完整订正数据：

```json
{
  "wrongQuestion": {
    "id": "wrong-question-uuid",
    "questionId": "question-uuid",
    "bankId": "bank-uuid",
    "bankName": "2025年C++程序设计",
    "subjectCategory": "信息技术",
    "subjectName": "C++",
    "questionType": "single_choice",
    "contentPreview": "Question preview",
    "wrongCount": 2,
    "lastAnswer": "[\"option-uuid\"]",
    "mastered": false,
    "lastWrongAt": "2026-07-10T09:00:00.000Z",
    "content": "Full question",
    "options": [
      {
        "id": "option-uuid",
        "sort": 1,
        "content": "Option text"
      }
    ],
    "correctAnswer": ["option-uuid"],
    "analysis": "Explanation"
  }
}
```

`correctAnswer` 已按题型规范化：

- 单选/多选：`string[]`
- 判断：`boolean`
- 其他：原始 `string`

### `POST /api/wrong-questions/review-sessions`

从筛选后的错题集合创建普通 sequential Practice session。

Request：

```json
{
  "bankId": "optional-bank-uuid",
  "includeMastered": false,
  "limit": 20
}
```

Defaults：

- `includeMastered=false`
- `limit=20`

`limit` 必须为整数 `1..100`。

Response：

```json
{
  "session": {
    "id": "session-uuid",
    "questionCount": 20
  }
}
```

创建后通过正常的 `GET /api/practice/sessions/:sessionId` 加载完整题目。

Errors：

- `404`：没有符合条件的错题。

### `POST /api/wrong-questions/:id/mastered`

将条目标记为已掌握。

Response：

```json
{
  "success": true
}
```

如果该题以后再次答错，upsert 会自动把 `mastered` 恢复为 false。

## Current Contract Debt

- Practice/Wrongbook/Learning/Auth/Catalog/Admin Auth/Admin User manage/Admin Bank Mapping read/write/Admin System Status/Admin Import Job/Admin Question Review/Admin Audit Log/通用 error/health/readiness/metrics DTO 已来自 shared v1；Learning 已覆盖 dashboard/trends/goals/review-marks；`mode=import` 已可在 `ADMIN_IMPORT_ENABLE_WRITE=true` 下写入，但 reset import、异步队列、取消/重试仍未实现。
- Fastify request parser 尚未统一使用共享 schema。
- `lastAnswer` 仍是序列化字符串，未来宜改为 typed answer。
- `completedCount` 已版本化固定为 answered/graded count，但字段名仍容易误解。
- 逐题 submit 与整卷 submit 同时存在。
- Admin Auth、Admin User manage、Admin Bank Mapping read/write、Admin System Status、Admin Import Job dry-run/Error Report/true import gate、Admin Question Review 与 Admin Audit Log route/shared schema 已实现；正式 Admin UI 尚未实现。
