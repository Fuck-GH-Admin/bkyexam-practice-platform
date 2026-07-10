# API

Base path：`/api`

除 health、login 和当前的 bank list 外，学生业务路由均依赖 `bky_session` Cookie。

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
  "error": "Human-readable message"
}
```

常见状态：

- `400`：参数或 body 无效。
- `401`：未登录、session 过期或已撤销。
- `404`：资源不存在、不属于当前学生，或题目不在该 session。
- `409`：尝试修改已经 completed 的 practice session。

### Versioned Runtime Contract

Practice 与 Wrongbook 的成功响应使用 `packages/shared/src/contracts/v1` 中的共享 Zod schema：

- Fastify route 在发送响应前校验 repository/业务编排输出。
- Web 在把响应写入页面状态前再次校验。
- 不合法的服务端成功 payload 被视为内部 contract bug，并 fail closed 为 `500`。

`v1` 当前是代码 schema 命名空间，不会额外出现在 JSON response 中。请求路由仍保留手写 parser，以保持现有错误文案和 legacy 行为；共享 request schema 已可供后续逐步迁移。

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
  "status": "ok"
}
```

该接口目前只证明 Fastify 进程可响应，不包含 PostgreSQL readiness。

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

当前 PostgreSQL 实现允许首次使用用户名时自动创建学生。正式生产身份策略尚未确定。

Response：

```json
{
  "student": {
    "id": "student-uuid",
    "loginName": "alice",
    "displayName": "alice"
  }
}
```

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
    "displayName": "Alice"
  }
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

### `GET /api/practice/sessions/active`

返回当前学生所有 active session summary，按 repository 顺序排列。

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

当前 Web 只自动恢复数组中的第一个 session；多 active session 的产品规则尚待定义。

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

- Practice/Wrongbook DTO 已来自 shared v1；Auth、Catalog、通用 error 与 Admin contract 尚未迁移。
- Fastify request parser 尚未统一使用共享 schema。
- `lastAnswer` 仍是序列化字符串，未来宜改为 typed answer。
- `completedCount` 已版本化固定为 answered/graded count，但字段名仍容易误解。
- 逐题 submit 与整卷 submit 同时存在。
- Admin API 尚未定义。
