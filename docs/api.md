# API

Base URL: `/api`.

## Auth

### `POST /api/auth/login`

Creates or verifies a student identity. When database-backed sessions are enabled, it creates a server-side session and sets the `bky_session` cookie.

Request:

```json
{
  "loginName": "alice",
  "password": "optional"
}
```

Success response keeps the existing public student shape:

```json
{
  "student": {
    "loginName": "alice",
    "displayName": "alice"
  }
}
```

Cookie options when a session is created:

- Name: `bky_session`.
- `httpOnly=true`.
- `sameSite=lax`.
- `secure` follows API cookie configuration.
- `path=/`.
- `expires` matches the server-side session expiration.

Errors:

- `400` when `loginName` is missing, empty, or the request shape is invalid.
- `401` when credentials are invalid.

### `GET /api/auth/me`

Returns the currently authenticated student from the `bky_session` cookie.

Success response:

```json
{
  "student": {
    "id": "student-uuid",
    "loginName": "alice",
    "displayName": "Alice"
  }
}
```

Errors:

- `401` when the cookie is missing, expired, revoked, or invalid.

### `POST /api/auth/logout`

Revokes the current session token when present and clears the `bky_session` cookie. Logging out without a current session is still successful.

Success response:

```json
{
  "success": true
}
```

## Practice

Practice routes require the `bky_session` cookie. Missing, expired, revoked, or invalid sessions return `401`.

### `POST /api/practice/sessions`

Creates a practice session for the current student.

Request:

```json
{
  "bankId": "bank-uuid",
  "mode": "random",
  "limit": 70,
  "questionTypes": ["single_choice", "multiple_choice", "yes_no"]
}
```

Defaults:

- `mode`: `random`.
- `limit`: `70`.
- `questionTypes`: `single_choice`, `multiple_choice`, `yes_no`.

Validation:

- `bankId` must be a canonical UUID string.
- `mode` must be `random` or `sequential`.
- `limit` must be an integer from `1` through `200`.
- `questionTypes`, when provided, must be a non-empty string array.

Success response:

```json
{
  "session": {
    "id": "session-uuid",
    "bankId": "bank-uuid",
    "mode": "random",
    "questionCount": 70,
    "completedCount": 0,
    "correctCount": 0,
    "status": "active"
  },
  "questions": [
    {
      "id": "question-uuid",
      "sort": 1,
      "type": "single_choice",
      "content": "Question text",
      "options": [{ "id": "option-uuid", "sort": 1, "content": "Option text" }],
      "answered": false
    }
  ]
}
```

Errors:

- `400` when the request body is invalid or `bankId` is malformed.
- `401` when unauthenticated.
- `404` when the bank does not exist or is hidden.

### `GET /api/practice/sessions/:sessionId`

Returns one practice session and its locked question list for the current student.

Success response uses the same `{ "session", "questions" }` shape as session creation.

Errors:

- `401` when unauthenticated.
- `400` when `sessionId` is malformed.
- `404` when the session does not exist or belongs to another student.

### `POST /api/practice/sessions/:sessionId/answers`

Submits an answer for one locked question in the current student's active practice session. Answers are graded server-side for objective question types, persisted to `practice_attempts`, reflected in the session progress counters, and written to `wrong_questions` when an objective answer is incorrect. Self-review answers do not auto-write wrong-question rows.

Request:

```json
{
  "questionId": "question-uuid",
  "answer": ["A"]
}
```

`answer` may be a string array, boolean, or string. Single-choice and multiple-choice questions compare option identifiers or normalized option labels. Yes/no questions compare booleans. Non-objective or ambiguous answers return `isCorrect: null` and `needsSelfReview: true`.

Success response:

```json
{
  "result": {
    "questionId": "question-uuid",
    "isCorrect": true,
    "correctAnswer": ["A"],
    "needsSelfReview": false
  },
  "session": {
    "completedCount": 1,
    "correctCount": 1,
    "status": "active"
  }
}
```

Repeated submissions for the same question update that question's latest correctness. `completedCount` is recomputed from answered locked questions and does not double-count repeats; `correctCount` is recomputed from currently correct answered rows.

Errors:

- `400` when `sessionId` or `questionId` is malformed, or `answer` is not a string array, boolean, or string.
- `401` when unauthenticated.
- `404` when the session does not exist, belongs to another student, or the question is not locked in the session.
- `409` when the session is already completed.

## Wrong Questions

Wrong-question routes require the `bky_session` cookie. Missing, expired, revoked, or invalid sessions return `401`.

### `GET /api/wrong-questions`

Returns the current student's wrong-question notebook entries. Mastered entries are excluded by default.

Query parameters:

- `bankId`: optional bank/classification identifier filter.
- `includeMastered`: set to exactly `true` to include mastered entries; any other value is treated as `false`.

Success response:

```json
{
  "wrongQuestions": [
    {
      "id": "wrong-question-uuid",
      "questionId": "question-uuid",
      "bankId": "bank-uuid",
      "wrongCount": 2,
      "lastAnswer": "A",
      "mastered": false,
      "lastWrongAt": "2026-01-02T03:04:05.000Z"
    }
  ]
}
```

Errors:

- `400` when `bankId` is present but is not a valid UUID.
- `401` when unauthenticated.

### `POST /api/wrong-questions/:id/mastered`

Marks one wrong-question notebook entry as mastered for the current student.

Success response:

```json
{
  "success": true
}
```

Errors:

- `400` when `id` is not a valid UUID.
- `401` when unauthenticated.
- `404` when the entry does not exist or belongs to another student.
