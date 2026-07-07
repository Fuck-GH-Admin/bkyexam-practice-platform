# Wrongbook Review Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the enhanced wrong-question review flow: richer wrong-question data, single-question review details, filtered wrong-question review sessions, and a desktop/mobile correction UI.

**Architecture:** Keep the existing Fastify route/repository pattern. Extend `WrongQuestionRepository` for list/detail/review-session data, let wrong-question review sessions create normal `practice_sessions` rows with locked questions sourced from `wrong_questions`, and keep the React app as a single-file shell while extracting small pure helpers for testability.

**Tech Stack:** TypeScript, Fastify, PostgreSQL SQL through `QueryClient`, React 19, Vite, Vitest, plain CSS.

---

## File Structure

- Modify: `apps/api/src/wrongQuestions/repository.ts`
  - Owns wrong-question summary/detail/review-session repository contracts and PostgreSQL SQL.
- Modify: `apps/api/src/routes/wrongQuestions.ts`
  - Owns auth, UUID/query validation, and HTTP status mapping for wrong-question endpoints.
- Modify: `apps/api/tests/wrongQuestions/repository.test.ts`
  - Tests SQL shape and DTO mapping for summary, detail, and review-session creation.
- Modify: `apps/api/tests/routes/wrongQuestions.test.ts`
  - Tests route auth, validation, repository calls, 404 behavior, and response shapes.
- Modify: `apps/web/src/App.tsx`
  - Owns current single-file React shell. Add enhanced wrongbook state, detail loading, review-session action, and helper exports.
- Modify: `apps/web/src/App.test.ts`
  - Tests new pure helpers for answer formatting, wrongbook counters, and selected detail state behavior.
- Modify: `apps/web/src/styles.css`
  - Adds two-column desktop correction desk and mobile continuous review card styles.
- Modify: `docs/api.md`
  - Documents enhanced wrong-question list, detail endpoint, and review-session endpoint.
- Modify: `docs/database.md`
  - Documents that enhanced review joins existing tables and does not duplicate question content.
- Modify: `docs/todo.md`
  - Marks the implemented Phase 3E slices as complete when the implementation is done.

## Task 1: Backend Summary Contract

**Files:**
- Modify: `apps/api/src/wrongQuestions/repository.ts`
- Test: `apps/api/tests/wrongQuestions/repository.test.ts`
- Test: `apps/api/tests/routes/wrongQuestions.test.ts`

- [ ] **Step 1: Write failing repository test for enhanced list mapping**

Add this row near `wrongQuestionRow` in `apps/api/tests/wrongQuestions/repository.test.ts`:

```ts
const enhancedWrongQuestionRow = {
  ...wrongQuestionRow,
  bank_name: 'C 语言程序设计',
  subject_category: '计算机基础',
  subject_name: 'C 语言',
  normalized_type: 'single_choice',
  content_preview: '下列关于数组初始化的说法，正确的是哪一项？',
};
```

Replace the first test's fake result with `enhancedWrongQuestionRow`, and expect the enhanced fields:

```ts
const client = new FakeQueryClient([{ rows: [enhancedWrongQuestionRow] }]);

expect(result).toEqual([
  {
    id: 'wrong-1',
    questionId: 'question-1',
    bankId: 'bank-1',
    bankName: 'C 语言程序设计',
    subjectCategory: '计算机基础',
    subjectName: 'C 语言',
    questionType: 'single_choice',
    contentPreview: '下列关于数组初始化的说法，正确的是哪一项？',
    wrongCount: 2,
    lastAnswer: 'A',
    mastered: false,
    lastWrongAt: '2026-01-02T03:04:05.000Z',
  },
]);
```

- [ ] **Step 2: Run repository test and verify it fails**

Run: `npm run test -w @bkyexam-practice/api -- apps/api/tests/wrongQuestions/repository.test.ts`

Expected: FAIL because `bankName`, `subjectCategory`, `subjectName`, `questionType`, and `contentPreview` are missing from mapped output.

- [ ] **Step 3: Implement summary type and SQL join**

In `apps/api/src/wrongQuestions/repository.ts`, extend `WrongQuestionItem`:

```ts
export interface WrongQuestionItem {
  id: string;
  questionId: string;
  bankId: string;
  bankName: string;
  subjectCategory: string;
  subjectName: string;
  questionType: string;
  contentPreview: string;
  wrongCount: number;
  lastAnswer: string;
  mastered: boolean;
  lastWrongAt: string;
}
```

Extend `WrongQuestionRow`:

```ts
interface WrongQuestionRow {
  id: string;
  question_id: string;
  bank_id: string;
  bank_name: string | null;
  subject_category: string | null;
  subject_name: string | null;
  normalized_type: string | null;
  content_preview: string | null;
  wrong_count: number | string;
  last_answer: string;
  mastered: boolean;
  last_wrong_at: Date | string;
}
```

Replace the list SQL `SELECT` with:

```sql
SELECT
  wrong_questions.id,
  wrong_questions.question_id,
  wrong_questions.bank_id,
  COALESCE(bank_mappings.bank_name, wrong_questions.bank_id::text) AS bank_name,
  COALESCE(bank_mappings.subject_category, '') AS subject_category,
  COALESCE(bank_mappings.subject_name, '') AS subject_name,
  questions.normalized_type,
  LEFT(regexp_replace(COALESCE(questions.content, ''), '\\s+', ' ', 'g'), 120) AS content_preview,
  wrong_questions.wrong_count,
  wrong_questions.last_answer,
  wrong_questions.mastered,
  wrong_questions.last_wrong_at
FROM wrong_questions
JOIN questions ON questions.id = wrong_questions.question_id
LEFT JOIN bank_mappings ON bank_mappings.bank_id = wrong_questions.bank_id
WHERE ${filters.join(' AND ')}
ORDER BY wrong_questions.last_wrong_at DESC, wrong_questions.id
```

Update `mapWrongQuestionRow`:

```ts
function mapWrongQuestionRow(row: WrongQuestionRow): WrongQuestionItem {
  return {
    id: row.id,
    questionId: row.question_id,
    bankId: row.bank_id,
    bankName: row.bank_name ?? row.bank_id,
    subjectCategory: row.subject_category ?? '',
    subjectName: row.subject_name ?? '',
    questionType: row.normalized_type ?? 'unknown',
    contentPreview: row.content_preview ?? '',
    wrongCount: Number(row.wrong_count),
    lastAnswer: row.last_answer,
    mastered: row.mastered,
    lastWrongAt: row.last_wrong_at instanceof Date ? row.last_wrong_at.toISOString() : row.last_wrong_at,
  };
}
```

- [ ] **Step 4: Update route test fixture**

In `apps/api/tests/routes/wrongQuestions.test.ts`, update `wrongQuestion`:

```ts
const wrongQuestion: WrongQuestionItem = {
  id: wrongQuestionId,
  questionId,
  bankId,
  bankName: 'C 语言程序设计',
  subjectCategory: '计算机基础',
  subjectName: 'C 语言',
  questionType: 'single_choice',
  contentPreview: '下列关于数组初始化的说法，正确的是哪一项？',
  wrongCount: 2,
  lastAnswer: 'A',
  mastered: false,
  lastWrongAt: '2026-01-02T03:04:05.000Z',
};
```

- [ ] **Step 5: Run backend wrong-question tests**

Run: `npm run test -w @bkyexam-practice/api -- apps/api/tests/wrongQuestions/repository.test.ts apps/api/tests/routes/wrongQuestions.test.ts`

Expected: PASS.

## Task 2: Backend Detail Endpoint

**Files:**
- Modify: `apps/api/src/wrongQuestions/repository.ts`
- Modify: `apps/api/src/routes/wrongQuestions.ts`
- Test: `apps/api/tests/wrongQuestions/repository.test.ts`
- Test: `apps/api/tests/routes/wrongQuestions.test.ts`

- [ ] **Step 1: Write repository interface and failing detail mapping test**

Add these types to the test by importing them after they are declared in implementation; during the failing step, use structural expectations only. Add this test:

```ts
it('loads one wrong-question review detail for the current student', async () => {
  const client = new FakeQueryClient([
    {
      rows: [
        {
          id: 'wrong-1',
          question_id: 'question-1',
          bank_id: 'bank-1',
          bank_name: 'C 语言程序设计',
          subject_category: '计算机基础',
          subject_name: 'C 语言',
          normalized_type: 'single_choice',
          content: '完整题干',
          answer_raw: 'A',
          analyze_raw: '解析文本',
          wrong_count: '2',
          last_answer: '["B"]',
          mastered: false,
          last_wrong_at: new Date('2026-01-02T03:04:05.000Z'),
        },
      ],
    },
    { rows: [{ id: 'option-a', question_id: 'question-1', sort: 1, content: 'A. 正确选项' }] },
  ]);
  const repository = createPgWrongQuestionRepository(client);

  const result = await repository.getDetail({ studentId: 'student-1', id: 'wrong-1' });

  expect(client.calls[0].sql).toContain('FROM wrong_questions');
  expect(client.calls[0].sql).toContain('wrong_questions.student_id = $1');
  expect(client.calls[0].sql).toContain('wrong_questions.id = $2');
  expect(client.calls[0].params).toEqual(['student-1', 'wrong-1']);
  expect(client.calls[1].sql).toContain('FROM question_options');
  expect(client.calls[1].params).toEqual(['question-1']);
  expect(result).toEqual({
    id: 'wrong-1',
    questionId: 'question-1',
    bankId: 'bank-1',
    bankName: 'C 语言程序设计',
    subjectCategory: '计算机基础',
    subjectName: 'C 语言',
    questionType: 'single_choice',
    content: '完整题干',
    options: [{ id: 'option-a', sort: 1, content: 'A. 正确选项' }],
    lastAnswer: '["B"]',
    correctAnswer: 'A',
    analysis: '解析文本',
    wrongCount: 2,
    mastered: false,
    lastWrongAt: '2026-01-02T03:04:05.000Z',
  });
});
```

Add missing-detail test:

```ts
it('returns null when a wrong-question detail is not owned by the student', async () => {
  const client = new FakeQueryClient([{ rows: [] }]);
  const repository = createPgWrongQuestionRepository(client);

  await expect(repository.getDetail({ studentId: 'student-1', id: 'wrong-2' })).resolves.toBeNull();
});
```

- [ ] **Step 2: Run repository test and verify it fails**

Run: `npm run test -w @bkyexam-practice/api -- apps/api/tests/wrongQuestions/repository.test.ts`

Expected: FAIL because `getDetail` is not defined.

- [ ] **Step 3: Implement detail repository contract**

In `apps/api/src/wrongQuestions/repository.ts`, add:

```ts
export interface WrongQuestionOption {
  id: string;
  sort: number;
  content: string;
}

export interface WrongQuestionDetail extends WrongQuestionItem {
  content: string;
  options: WrongQuestionOption[];
  correctAnswer: string;
  analysis: string;
}

export interface WrongQuestionRepository {
  list(input: { studentId: string; bankId?: string; includeMastered: boolean }): Promise<WrongQuestionItem[]>;
  getDetail(input: { studentId: string; id: string }): Promise<WrongQuestionDetail | null>;
  markMastered(input: { studentId: string; id: string }): Promise<boolean>;
}
```

Add memory implementation:

```ts
async getDetail({ studentId, id }) {
  const item = items.find((candidate) => candidate.studentId === studentId && candidate.id === id);
  if (!item) return null;
  return {
    ...item,
    content: item.contentPreview,
    options: [],
    correctAnswer: '',
    analysis: '',
  };
},
```

Add PostgreSQL implementation before `markMastered`:

```ts
async getDetail({ studentId, id }) {
  const result = (await client.query(
    `
      SELECT
        wrong_questions.id,
        wrong_questions.question_id,
        wrong_questions.bank_id,
        COALESCE(bank_mappings.bank_name, wrong_questions.bank_id::text) AS bank_name,
        COALESCE(bank_mappings.subject_category, '') AS subject_category,
        COALESCE(bank_mappings.subject_name, '') AS subject_name,
        questions.normalized_type,
        questions.content,
        questions.answer_raw,
        questions.analyze_raw,
        wrong_questions.wrong_count,
        wrong_questions.last_answer,
        wrong_questions.mastered,
        wrong_questions.last_wrong_at
      FROM wrong_questions
      JOIN questions ON questions.id = wrong_questions.question_id
      LEFT JOIN bank_mappings ON bank_mappings.bank_id = wrong_questions.bank_id
      WHERE wrong_questions.student_id = $1
        AND wrong_questions.id = $2
      LIMIT 1
    `,
    [studentId, id],
  )) as QueryRows<WrongQuestionDetailRow>;
  const row = result.rows[0];
  if (!row) return null;

  const optionResult = (await client.query(
    `
      SELECT id, question_id, sort, content
      FROM question_options
      WHERE question_id = $1
      ORDER BY sort, id
    `,
    [row.question_id],
  )) as QueryRows<WrongQuestionOptionRow>;

  return mapWrongQuestionDetailRow(row, optionResult.rows);
},
```

Add row and mapper types:

```ts
interface WrongQuestionDetailRow extends Omit<WrongQuestionRow, 'content_preview'> {
  content: string | null;
  answer_raw: string | null;
  analyze_raw: string | null;
}

interface WrongQuestionOptionRow {
  id: string;
  question_id: string;
  sort: number | string;
  content: string | null;
}

function mapWrongQuestionDetailRow(row: WrongQuestionDetailRow, options: WrongQuestionOptionRow[]): WrongQuestionDetail {
  return {
    ...mapWrongQuestionRow({
      ...row,
      content_preview: row.content ? row.content.replace(/\s+/g, ' ').slice(0, 120) : '',
    }),
    content: row.content ?? '',
    options: options.map((option) => ({ id: option.id, sort: Number(option.sort), content: option.content ?? '' })),
    correctAnswer: row.answer_raw ?? '',
    analysis: row.analyze_raw ?? '',
  };
}
```

- [ ] **Step 4: Write route tests for detail endpoint**

In `apps/api/tests/routes/wrongQuestions.test.ts`, extend fake repository:

```ts
const detailRequests: Parameters<WrongQuestionRepository['getDetail']>[0][] = [];
```

Add method:

```ts
async getDetail(input) {
  detailRequests.push(input);
  if (options.detailResult === false) return null;
  return {
    ...wrongQuestion,
    content: '完整题干',
    options: [{ id: 'option-a', sort: 1, content: 'A. 正确选项' }],
    correctAnswer: 'A',
    analysis: '解析文本',
  };
},
```

Update `fakeWrongQuestionRepository` options type:

```ts
function fakeWrongQuestionRepository(options: { markMasteredResult?: boolean; detailResult?: false } = {}) {
```

Return `detailRequests` from the helper.

Add tests:

```ts
it('returns one wrong-question review detail for the current student', async () => {
  const { repository, detailRequests } = fakeWrongQuestionRepository();
  const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

  const response = await app.inject({
    method: 'GET',
    url: `/api/wrong-questions/${wrongQuestionId}`,
    headers: { cookie: 'bky_session=token' },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    wrongQuestion: {
      ...wrongQuestion,
      content: '完整题干',
      options: [{ id: 'option-a', sort: 1, content: 'A. 正确选项' }],
      correctAnswer: 'A',
      analysis: '解析文本',
    },
  });
  expect(detailRequests).toEqual([{ studentId: 'student-1', id: wrongQuestionId }]);
});

it('returns 400 for an invalid detail route id', async () => {
  const { repository } = fakeWrongQuestionRepository();
  const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

  const response = await app.inject({
    method: 'GET',
    url: '/api/wrong-questions/not-a-uuid',
    headers: { cookie: 'bky_session=token' },
  });

  expect(response.statusCode).toBe(400);
});

it('returns 404 when a detail is missing or not owned by the current student', async () => {
  const { repository } = fakeWrongQuestionRepository({ detailResult: false });
  const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

  const response = await app.inject({
    method: 'GET',
    url: `/api/wrong-questions/${missingWrongQuestionId}`,
    headers: { cookie: 'bky_session=token' },
  });

  expect(response.statusCode).toBe(404);
});
```

- [ ] **Step 5: Implement route**

In `apps/api/src/routes/wrongQuestions.ts`, add this route before `markMastered`:

```ts
app.get('/api/wrong-questions/:id', async (request, reply) => {
  const student = await requireStudent(request);
  if (!student) {
    return reply.status(401).send({ error: 'Unauthenticated' });
  }

  const { id } = request.params as { id?: unknown };
  if (typeof id !== 'string' || !id.trim()) {
    return reply.status(404).send({ error: 'Wrong question not found' });
  }
  if (!isUuid(id)) {
    return reply.status(400).send({ error: 'id must be a valid UUID' });
  }

  const wrongQuestion = await wrongQuestionRepository.getDetail({ studentId: student.id, id });
  if (!wrongQuestion) {
    return reply.status(404).send({ error: 'Wrong question not found' });
  }

  return { wrongQuestion };
});
```

- [ ] **Step 6: Run backend wrong-question tests**

Run: `npm run test -w @bkyexam-practice/api -- apps/api/tests/wrongQuestions/repository.test.ts apps/api/tests/routes/wrongQuestions.test.ts`

Expected: PASS.

## Task 3: Backend Review Session Endpoint

**Files:**
- Modify: `apps/api/src/wrongQuestions/repository.ts`
- Modify: `apps/api/src/routes/wrongQuestions.ts`
- Test: `apps/api/tests/wrongQuestions/repository.test.ts`
- Test: `apps/api/tests/routes/wrongQuestions.test.ts`

- [ ] **Step 1: Add failing route test for review-session creation**

Extend fake repository with request capture:

```ts
const createReviewSessionRequests: Parameters<WrongQuestionRepository['createReviewSession']>[0][] = [];
```

Add method:

```ts
async createReviewSession(input) {
  createReviewSessionRequests.push(input);
  return options.reviewSessionResult === false
    ? null
    : { sessionId: '66666666-6666-4666-8666-666666666666', questionCount: 2 };
},
```

Update options type:

```ts
function fakeWrongQuestionRepository(options: { markMasteredResult?: boolean; detailResult?: false; reviewSessionResult?: false } = {}) {
```

Return `createReviewSessionRequests` from helper.

Add test:

```ts
it('creates a filtered wrong-question review session for the current student', async () => {
  const { repository, createReviewSessionRequests } = fakeWrongQuestionRepository();
  const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

  const response = await app.inject({
    method: 'POST',
    url: '/api/wrong-questions/review-sessions',
    headers: { cookie: 'bky_session=token' },
    payload: { bankId: filteredBankId, includeMastered: true, limit: 20 },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    session: { id: '66666666-6666-4666-8666-666666666666', questionCount: 2 },
  });
  expect(createReviewSessionRequests).toEqual([
    { studentId: 'student-1', bankId: filteredBankId, includeMastered: true, limit: 20 },
  ]);
});
```

Add validation tests:

```ts
it('returns 400 for invalid review-session input', async () => {
  const { repository } = fakeWrongQuestionRepository();
  const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

  const response = await app.inject({
    method: 'POST',
    url: '/api/wrong-questions/review-sessions',
    headers: { cookie: 'bky_session=token' },
    payload: { bankId: 'not-a-uuid', limit: 0 },
  });

  expect(response.statusCode).toBe(400);
});

it('returns 404 when no wrong questions match the review-session filters', async () => {
  const { repository } = fakeWrongQuestionRepository({ reviewSessionResult: false });
  const app = buildApp({ sessionService: fakeLoggedInSessionService(), wrongQuestionRepository: repository });

  const response = await app.inject({
    method: 'POST',
    url: '/api/wrong-questions/review-sessions',
    headers: { cookie: 'bky_session=token' },
    payload: {},
  });

  expect(response.statusCode).toBe(404);
});
```

- [ ] **Step 2: Run route test and verify it fails**

Run: `npm run test -w @bkyexam-practice/api -- apps/api/tests/routes/wrongQuestions.test.ts`

Expected: FAIL because `createReviewSession` and the route do not exist.

- [ ] **Step 3: Implement repository contract and memory implementation**

In `WrongQuestionRepository`, add:

```ts
createReviewSession(input: {
  studentId: string;
  bankId?: string;
  includeMastered: boolean;
  limit: number;
}): Promise<{ sessionId: string; questionCount: number } | null>;
```

Memory implementation:

```ts
async createReviewSession({ studentId, bankId, includeMastered, limit }) {
  const selected = items
    .filter((item) => item.studentId === studentId)
    .filter((item) => !bankId || item.bankId === bankId)
    .filter((item) => includeMastered || !item.mastered)
    .slice(0, limit);
  if (selected.length === 0) return null;
  return { sessionId: 'memory-review-session', questionCount: selected.length };
},
```

- [ ] **Step 4: Add repository SQL test**

In `repository.test.ts`, add:

```ts
it('creates a practice session from matching wrong questions', async () => {
  const client = new FakeQueryClient([
    { rows: [{ question_id: 'question-1', bank_id: 'bank-1' }, { question_id: 'question-2', bank_id: 'bank-1' }] },
    { rows: [{ id: 'session-1' }] },
    { rows: [] },
  ]);
  const repository = createPgWrongQuestionRepository(client);

  const result = await repository.createReviewSession({ studentId: 'student-1', includeMastered: false, limit: 20 });

  expect(client.calls[0].sql).toContain('FROM wrong_questions');
  expect(client.calls[0].sql).toContain('mastered = false');
  expect(client.calls[0].sql).toContain('LIMIT $2');
  expect(client.calls[1].sql).toContain('INSERT INTO practice_sessions');
  expect(client.calls[2].sql).toContain('INSERT INTO practice_session_questions');
  expect(result).toEqual({ sessionId: 'session-1', questionCount: 2 });
});
```

- [ ] **Step 5: Implement PostgreSQL review-session creation**

In `repository.ts`, import `randomUUID` if not already available:

```ts
import { randomUUID } from 'node:crypto';
```

Add implementation after `getDetail`:

```ts
async createReviewSession({ studentId, bankId, includeMastered, limit }) {
  const params: unknown[] = [studentId, limit];
  const filters = ['student_id = $1'];
  if (!includeMastered) filters.push('mastered = false');
  if (bankId) {
    params.push(bankId);
    filters.push(`bank_id = $${params.length}`);
  }

  const selectedResult = (await client.query(
    `
      SELECT question_id, bank_id
      FROM wrong_questions
      WHERE ${filters.join(' AND ')}
      ORDER BY last_wrong_at DESC, id
      LIMIT $2
    `,
    params,
  )) as QueryRows<{ question_id: string; bank_id: string }>;
  const selected = selectedResult.rows;
  if (selected.length === 0) return null;

  const sessionId = randomUUID();
  const sessionResult = (await client.query(
    `
      INSERT INTO practice_sessions (id, student_id, bank_id, mode, question_limit, question_count, completed_count, correct_count, status)
      VALUES ($1, $2, $3, 'sequential', $4, $4, 0, 0, 'active')
      RETURNING id
    `,
    [sessionId, studentId, selected[0].bank_id, selected.length],
  )) as QueryRows<{ id: string }>;

  const values = selected.map((_, index) => `($1, $${index + 2}, ${index + 1})`).join(', ');
  await client.query(
    `
      INSERT INTO practice_session_questions (session_id, question_id, sort)
      VALUES ${values}
    `,
    [sessionResult.rows[0].id, ...selected.map((item) => item.question_id)],
  );

  return { sessionId: sessionResult.rows[0].id, questionCount: selected.length };
},
```

The review session uses `mode = 'sequential'` because the current `practice_sessions.mode` contract accepts only `random` or `sequential`. Do not add a schema migration for a new mode in this implementation.

- [ ] **Step 6: Implement route validation and response**

In `routes/wrongQuestions.ts`, add before `/:id` routes so it is not captured as an id:

```ts
app.post('/api/wrong-questions/review-sessions', async (request, reply) => {
  const student = await requireStudent(request);
  if (!student) {
    return reply.status(401).send({ error: 'Unauthenticated' });
  }

  const body = (request.body ?? {}) as { bankId?: unknown; includeMastered?: unknown; limit?: unknown };
  const bankId = typeof body.bankId === 'string' && body.bankId.trim() ? body.bankId : undefined;
  if (bankId && !isUuid(bankId)) {
    return reply.status(400).send({ error: 'bankId must be a valid UUID' });
  }
  const limit = body.limit === undefined ? 20 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return reply.status(400).send({ error: 'limit must be an integer from 1 through 100' });
  }

  const session = await wrongQuestionRepository.createReviewSession({
    studentId: student.id,
    ...(bankId ? { bankId } : {}),
    includeMastered: body.includeMastered === true,
    limit,
  });
  if (!session) {
    return reply.status(404).send({ error: 'No wrong questions matched the filters' });
  }

  return { session: { id: session.sessionId, questionCount: session.questionCount } };
});
```

- [ ] **Step 7: Run backend wrong-question tests**

Run: `npm run test -w @bkyexam-practice/api -- apps/api/tests/wrongQuestions/repository.test.ts apps/api/tests/routes/wrongQuestions.test.ts`

Expected: PASS.

## Task 4: Frontend Data Types And Helpers

**Files:**
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/src/App.test.ts`

- [ ] **Step 1: Add failing helper tests**

In `apps/web/src/App.test.ts`, update import:

```ts
import { buildWrongbookStats, formatCorrectAnswer, formatStoredAnswer, getVisibleChips, hasSubmittedAnswer } from './App';
```

Add tests:

```ts
describe('formatStoredAnswer', () => {
  test('formats JSON array answers', () => {
    expect(formatStoredAnswer('["B","D"]')).toBe('B、D');
  });

  test('returns plain stored answers when they are not JSON arrays', () => {
    expect(formatStoredAnswer('false')).toBe('false');
  });
});

describe('buildWrongbookStats', () => {
  test('counts active and mastered wrong questions', () => {
    expect(buildWrongbookStats([
      { id: '1', mastered: false, lastWrongAt: '2026-01-02T00:00:00.000Z' },
      { id: '2', mastered: true, lastWrongAt: '2026-01-03T00:00:00.000Z' },
    ])).toEqual({ total: 2, active: 1, mastered: 1, latestWrongAt: '2026-01-03T00:00:00.000Z' });
  });
});
```

- [ ] **Step 2: Run web tests and verify they fail**

Run: `npm run test -w @bkyexam-practice/web -- apps/web/src/App.test.ts`

Expected: FAIL because helper exports do not exist.

- [ ] **Step 3: Implement helper functions and expanded types**

In `apps/web/src/App.tsx`, expand `WrongQuestion`:

```ts
type WrongQuestion = {
  id: string;
  questionId: string;
  bankId: string;
  bankName: string;
  subjectCategory: string;
  subjectName: string;
  questionType: string;
  contentPreview: string;
  wrongCount: number;
  lastAnswer: string;
  mastered: boolean;
  lastWrongAt: string;
};

type WrongQuestionDetail = WrongQuestion & {
  content: string;
  options: PracticeOption[];
  correctAnswer: string;
  analysis: string;
};
```

Add helpers after `formatCorrectAnswer`:

```ts
export function formatStoredAnswer(answer: string) {
  try {
    const parsed = JSON.parse(answer) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String).join('、');
    return String(parsed);
  } catch {
    return answer;
  }
}

export function buildWrongbookStats(items: Array<{ mastered: boolean; lastWrongAt: string }>) {
  const latestWrongAt = items
    .map((item) => item.lastWrongAt)
    .sort()
    .at(-1) ?? '';
  return {
    total: items.length,
    active: items.filter((item) => !item.mastered).length,
    mastered: items.filter((item) => item.mastered).length,
    latestWrongAt,
  };
}
```

- [ ] **Step 4: Run web tests**

Run: `npm run test -w @bkyexam-practice/web -- apps/web/src/App.test.ts`

Expected: PASS.

## Task 5: Frontend Wrongbook Detail Flow

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.ts`

- [ ] **Step 1: Add state and API helpers**

In `App`, add state near wrongbook state:

```ts
const [selectedWrongId, setSelectedWrongId] = useState('');
const [wrongDetail, setWrongDetail] = useState<WrongQuestionDetail | null>(null);
const [wrongDetailLoading, setWrongDetailLoading] = useState(false);
```

Add loader after `loadWrongQuestions`:

```ts
async function loadWrongQuestionDetail(id: string) {
  setSelectedWrongId(id);
  setWrongDetailLoading(true);
  setMessage('');
  try {
    const result = await api<{ wrongQuestion: WrongQuestionDetail }>(`/api/wrong-questions/${id}`);
    setWrongDetail(result.wrongQuestion);
  } catch (error) {
    setWrongDetail(null);
    setMessage(error instanceof Error ? error.message : '错题详情加载失败');
  } finally {
    setWrongDetailLoading(false);
  }
}
```

Update `markMastered`:

```ts
async function markMastered(id: string) {
  await api(`/api/wrong-questions/${id}/mastered`, { method: 'POST', body: '{}' });
  setWrongDetail((detail) => (detail && detail.id === id ? { ...detail, mastered: true } : detail));
  await loadWrongQuestions({ bankId: wrongBankId, includeMastered });
}
```

- [ ] **Step 2: Replace wrong view markup with correction desk**

Replace the current `view === 'wrong'` block with:

```tsx
{view === 'wrong' && (
  <section className="wrongbook-layout">
    <aside className="wrongbook-queue panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Correction queue</p>
          <h2>错题订正</h2>
        </div>
        <button onClick={() => loadWrongQuestions({ bankId: wrongBankId, includeMastered })}>刷新</button>
      </div>
      <div className="wrongbook-stats">
        {(() => {
          const stats = buildWrongbookStats(wrongQuestions);
          return (
            <>
              <span><strong>{stats.active}</strong>未掌握</span>
              <span><strong>{stats.mastered}</strong>已掌握</span>
              <span><strong>{stats.total}</strong>全部</span>
            </>
          );
        })()}
      </div>
      <div className="toolbar wrong-toolbar">
        <select value={wrongBankId} onChange={(event) => setWrongBankId(event.target.value)}>
          <option value="">全部题库</option>
          {banks.map((bank) => <option key={bank.bankId} value={bank.bankId}>{bank.bankName}</option>)}
        </select>
        <label className="checkbox-row">
          <input type="checkbox" checked={includeMastered} onChange={(event) => setIncludeMastered(event.target.checked)} />
          显示已掌握
        </label>
      </div>
      <div className="wrong-list">
        {filteredWrongQuestions.length === 0 && <p className="empty">当前筛选下没有错题。先去练一组题，或切换筛选条件。</p>}
        {filteredWrongQuestions.map((item) => (
          <button className={`wrong-review-card ${selectedWrongId === item.id ? 'active' : ''}`} key={item.id} onClick={() => loadWrongQuestionDetail(item.id)}>
            <span className="status">{typeLabel(item.questionType)}</span>
            <strong>{item.contentPreview || item.questionId}</strong>
            <span>{item.bankName} · 错 {item.wrongCount} 次 · 最近答案：{formatStoredAnswer(item.lastAnswer)}</span>
          </button>
        ))}
      </div>
    </aside>
    <article className="wrongbook-detail panel">
      {!wrongDetail && !wrongDetailLoading && <p className="empty">选择左侧一道错题开始订正。</p>}
      {wrongDetailLoading && <p className="empty">正在加载错题详情...</p>}
      {wrongDetail && (
        <>
          <div className="question-head">
            <span>{wrongDetail.bankName}</span>
            <span>{typeLabel(wrongDetail.questionType)} · 错 {wrongDetail.wrongCount} 次</span>
          </div>
          <h2>{wrongDetail.content || '（题干为空）'}</h2>
          <div className="answer-grid review-options">
            {wrongDetail.options.map((option) => (
              <div className="review-option" key={option.id}>
                <span>{option.sort}</span>
                {option.content || option.id}
              </div>
            ))}
          </div>
          <div className="review-panels">
            <section><strong>我的最近错误答案</strong><p>{formatStoredAnswer(wrongDetail.lastAnswer)}</p></section>
            <section><strong>参考答案</strong><p>{formatStoredAnswer(wrongDetail.correctAnswer)}</p></section>
            <section><strong>解析</strong><p>{wrongDetail.analysis || '当前题目没有解析。'}</p></section>
          </div>
          <div className="question-actions">
            <button onClick={() => markMastered(wrongDetail.id)} disabled={wrongDetail.mastered}>{wrongDetail.mastered ? '已掌握' : '标记掌握'}</button>
            <button className="ghost" onClick={() => createWrongReviewSession()}>再练当前筛选</button>
          </div>
        </>
      )}
    </article>
  </section>
)}
```

- [ ] **Step 3: Add review-session API action**

Add function before render:

```ts
async function createWrongReviewSession() {
  setLoading(true);
  setMessage('');
  try {
    const result = await api<{ session: { id: string; questionCount: number } }>('/api/wrong-questions/review-sessions', {
      method: 'POST',
      body: JSON.stringify({ bankId: wrongBankId || undefined, includeMastered, limit: 20 }),
    });
    const payload = await api<PracticePayload>(`/api/practice/sessions/${result.session.id}`);
    setSession(payload.session);
    setQuestions(payload.questions);
    setCurrentIndex(0);
    setSelectedOptions([]);
    setYesNoAnswer(null);
    setLastResult(null);
    setAnswersByQuestion({});
    setResultsByQuestion({});
    setView('practice');
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '错题再练创建失败');
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 4: Add CSS for desktop and mobile**

Add to `apps/web/src/styles.css` before media query:

```css
.wrongbook-layout {
  display: grid;
  grid-template-columns: minmax(300px, 380px) 1fr;
  gap: 16px;
  max-width: 1320px;
  margin: 0 auto;
}

.wrongbook-queue,
.wrongbook-detail {
  padding: 18px;
}

.wrongbook-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 14px 0;
}

.wrongbook-stats span {
  border-radius: 16px;
  background: #f0f6f8;
  color: #52677a;
  font-size: 0.82rem;
  font-weight: 800;
  padding: 10px;
}

.wrongbook-stats strong {
  display: block;
  color: #185adb;
  font-size: 1.5rem;
}

.wrong-review-card {
  display: grid;
  gap: 8px;
  width: 100%;
  border: 1px solid #d9e3ed;
  background: white;
  color: #17202a;
  text-align: left;
}

.wrong-review-card.active {
  border-color: #185adb;
  box-shadow: inset 5px 0 0 #185adb;
}

.wrong-review-card span:last-child {
  color: #6b7c8d;
  font-size: 0.88rem;
}

.wrongbook-detail h2 {
  white-space: pre-wrap;
  line-height: 1.45;
}

.review-options {
  margin: 16px 0;
}

.review-option {
  display: flex;
  gap: 12px;
  border: 1px solid #d6e1ed;
  border-radius: 16px;
  background: #f8fbff;
  padding: 12px;
}

.review-option span {
  display: inline-grid;
  min-width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 999px;
  background: #e7eef8;
  color: #185adb;
  font-weight: 900;
}

.review-panels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}

.review-panels section {
  border: 1px solid #d9e3ed;
  border-radius: 18px;
  background: #fffdf7;
  padding: 14px;
}
```

Extend media query:

```css
  .wrongbook-layout,
  .review-panels { grid-template-columns: 1fr; }
  .wrongbook-detail { order: -1; }
```

- [ ] **Step 5: Run web tests and typecheck**

Run: `npm run test -w @bkyexam-practice/web -- apps/web/src/App.test.ts`

Expected: PASS.

Run: `npm run typecheck -w @bkyexam-practice/web`

Expected: PASS.

## Task 6: API And Architecture Docs

**Files:**
- Modify: `docs/api.md`
- Modify: `docs/database.md`
- Modify: `docs/todo.md`

- [ ] **Step 1: Update API docs**

In `docs/api.md`, update wrong-question list response to include:

```json
{
  "id": "wrong-question-uuid",
  "questionId": "question-uuid",
  "bankId": "bank-uuid",
  "bankName": "C 语言程序设计",
  "subjectCategory": "计算机基础",
  "subjectName": "C 语言",
  "questionType": "single_choice",
  "contentPreview": "Question preview",
  "wrongCount": 2,
  "lastAnswer": "[\"B\"]",
  "mastered": false,
  "lastWrongAt": "2026-01-02T03:04:05.000Z"
}
```

Add `GET /api/wrong-questions/:id` with response matching `WrongQuestionDetail`.

Add `POST /api/wrong-questions/review-sessions` request:

```json
{
  "bankId": "optional-bank-uuid",
  "includeMastered": false,
  "limit": 20
}
```

Response:

```json
{
  "session": {
    "id": "session-uuid",
    "questionCount": 20
  }
}
```

- [ ] **Step 2: Update database docs**

In `docs/database.md`, add under `wrong_questions`:

```md
Enhanced wrong-question review does not duplicate question text, options, answers, or analysis into `wrong_questions`. Review APIs join `wrong_questions` with `questions`, `question_options`, and `bank_mappings`. `wrong_questions.last_answer` remains the latest wrong answer snapshot used for comparison.
```

- [ ] **Step 3: Update todo**

After implementation, change Phase 3E wrongbook bullets to start with `Backend/UI complete:` for slices actually shipped.

- [ ] **Step 4: Run markdown/content sanity checks**

Run: `git diff --check`

Expected: PASS except acceptable line-ending warnings if the repo already emits them.

## Task 7: Full Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run backend tests**

Run: `npm run test -w @bkyexam-practice/api`

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run: `npm run test -w @bkyexam-practice/web`

Expected: PASS.

- [ ] **Step 3: Run workspace typecheck**

Run: `npm run typecheck --workspaces`

Expected: PASS.

- [ ] **Step 4: Run workspace build**

Run: `npm run build --workspaces`

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run: `git diff -- apps/api/src/wrongQuestions/repository.ts apps/api/src/routes/wrongQuestions.ts apps/web/src/App.tsx apps/web/src/styles.css docs/api.md docs/database.md docs/todo.md`

Expected: Diff only contains wrongbook review enhancement work.

## Self-Review Notes

- Spec coverage: Backend summary fields are covered by Task 1; detail endpoint by Task 2; review session by Task 3; desktop/mobile UI by Task 5; docs by Task 6; verification by Task 7.
- Placeholder scan: This plan avoids placeholder markers and gives concrete tests, code snippets, commands, and expected results.
- Type consistency: The plan uses `WrongQuestionItem`, `WrongQuestionDetail`, `WrongQuestionOption`, `getDetail`, `createReviewSession`, `formatStoredAnswer`, and `buildWrongbookStats` consistently across tasks.
