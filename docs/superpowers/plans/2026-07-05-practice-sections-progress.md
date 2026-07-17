# Practice Sections And Unified Submission Implementation Plan

> Historical implementation plan. The feature is implemented; unchecked boxes below are not the current project tracker. Use `docs/todo.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sectioned practice for `单选题`, `多选题`, and `判断题` with draft autosave, `标记存疑`, resumable sessions, and whole-session grading.

**Architecture:** Keep the current React single-page app and Fastify API. Add server-side session drafts plus `current_sort`, return practice questions with draft/review/submitted state, and make whole-session submission the primary grading path while leaving the old single-answer endpoint available for compatibility.

**Tech Stack:** React, Vite, Vitest, Fastify, PostgreSQL, Drizzle schema definitions, existing SQL migration runner.

**Commit Policy:** Do not create git commits unless the user explicitly asks. Treat each task's final verification as the checkpoint.

---

## File Structure

- Modify: `apps/api/src/db/migrations/0003_practice_drafts.sql` to add `practice_session_drafts` and `practice_sessions.current_sort`.
- Modify: `apps/api/src/db/schema.ts` to export the draft table and `currentSort` field.
- Modify: `apps/api/tests/db/migration.test.ts` and `apps/api/tests/db/schema.test.ts` to cover the new migration/schema exports.
- Modify: `apps/api/src/practice/repository.ts` to support active sessions, draft save/clear, review flags, current position, grouped section payloads, and whole-session submission.
- Modify: `apps/api/tests/practice/repository.test.ts` to drive the repository behavior with failing tests first.
- Modify: `apps/api/src/routes/practice.ts` to expose active sessions, progress, drafts, review flags, and whole-session submission routes.
- Modify: `apps/api/tests/routes/practice.test.ts` to cover route validation, auth, and repository delegation.
- Modify: `apps/web/src/App.tsx` to add the logged-in home, sectioned practice UI, autosaved drafts, review flags, nickname menu logout, and whole-session result screen.
- Modify: `apps/web/src/App.test.ts` to cover pure helpers for section grouping, answer state, review state, unanswered counts, and score summaries.
- Modify: `apps/web/src/styles.css` to support desktop/mobile layout, section tabs, sticky mobile actions, review indicators, user menu, and result summary.
- Optional docs update after implementation: `docs/database.md` and `docs/architecture.md` to describe the draft/progress behavior.

---

### Task 1: Database Migration And Schema

**Files:**
- Create: `apps/api/src/db/migrations/0003_practice_drafts.sql`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/tests/db/migration.test.ts`
- Modify: `apps/api/tests/db/schema.test.ts`

- [ ] **Step 1: Write failing migration tests**

Add this test to `apps/api/tests/db/migration.test.ts`:

```ts
it('creates practice draft storage and current practice position', async () => {
  const sql = await readFile(join(process.cwd(), 'src/db/migrations/0003_practice_drafts.sql'), 'utf8');

  expect(sql).toContain('ALTER TABLE practice_sessions');
  expect(sql).toContain('ADD COLUMN IF NOT EXISTS current_sort integer NOT NULL DEFAULT 1');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS practice_session_drafts');
  expect(sql).toContain('draft_answer text NOT NULL DEFAULT');
  expect(sql).toContain('marked_for_review boolean NOT NULL DEFAULT false');
  expect(sql).toContain('UNIQUE (session_id, question_id)');
  expect(sql).toContain('practice_session_drafts_session_id_idx');
  expect(sql).toContain('practice_session_drafts_student_id_idx');
});
```

Add `practiceSessionDrafts` to the imports in `apps/api/tests/db/schema.test.ts`, then update the table-name test:

```ts
expect(getTableName(practiceSessionDrafts)).toBe('practice_session_drafts');
```

Add this schema test:

```ts
it('exports practice draft table for resumable answers and review flags', () => {
  expect(practiceSessionDrafts).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -w @bkyexam-practice/api -- tests/db/migration.test.ts tests/db/schema.test.ts`

Expected: FAIL because `0003_practice_drafts.sql` and `practiceSessionDrafts` do not exist yet.

- [ ] **Step 3: Add migration SQL**

Create `apps/api/src/db/migrations/0003_practice_drafts.sql`:

```sql
ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS current_sort integer NOT NULL DEFAULT 1 CHECK (current_sort > 0);

CREATE TABLE IF NOT EXISTS practice_session_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  draft_answer text NOT NULL DEFAULT '',
  marked_for_review boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS practice_session_drafts_session_id_idx ON practice_session_drafts(session_id);
CREATE INDEX IF NOT EXISTS practice_session_drafts_student_id_idx ON practice_session_drafts(student_id);
CREATE INDEX IF NOT EXISTS practice_session_drafts_question_id_idx ON practice_session_drafts(question_id);
```

- [ ] **Step 4: Add Drizzle schema exports**

Update `practiceSessions` in `apps/api/src/db/schema.ts`:

```ts
currentSort: integer('current_sort').notNull().default(1),
```

Add after `practiceSessionQuestions`:

```ts
export const practiceSessionDrafts = pgTable(
  'practice_session_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => practiceSessions.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    draftAnswer: text('draft_answer').notNull().default(''),
    markedForReview: boolean('marked_for_review').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('practice_session_drafts_session_id_idx').on(table.sessionId),
    index('practice_session_drafts_student_id_idx').on(table.studentId),
    index('practice_session_drafts_question_id_idx').on(table.questionId),
    uniqueIndex('practice_session_drafts_session_question_unique_idx').on(table.sessionId, table.questionId),
  ],
);
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm run test -w @bkyexam-practice/api -- tests/db/migration.test.ts tests/db/schema.test.ts`

Expected: PASS.

---

### Task 2: Repository Types And Session Read Model

**Files:**
- Modify: `apps/api/src/practice/repository.ts`
- Modify: `apps/api/tests/practice/repository.test.ts`

- [ ] **Step 1: Write failing repository tests for grouped session details**

Add this helper type expectation inside a new repository test:

```ts
it('returns current position, draft answers, and review flags when reading a session', async () => {
  const client = new FakeQueryClient([
    [{ id: 'session-1', bank_id: 'bank-1', mode: 'random', question_count: 3, completed_count: 0, correct_count: 0, status: 'active', current_sort: 2 }],
    [
      { id: 'session-1', bank_id: 'bank-1', mode: 'random', question_count: 3, completed_count: 0, correct_count: 0, status: 'active', current_sort: 2, question_id: 'question-1', sort: 1, normalized_type: 'single_choice', content: 'Single', answered: false, is_correct: null, draft_answer: '[]', marked_for_review: false },
      { id: 'session-1', bank_id: 'bank-1', mode: 'random', question_count: 3, completed_count: 0, correct_count: 0, status: 'active', current_sort: 2, question_id: 'question-2', sort: 2, normalized_type: 'multiple_choice', content: 'Multiple', answered: false, is_correct: null, draft_answer: '["A","B"]', marked_for_review: true },
      { id: 'session-1', bank_id: 'bank-1', mode: 'random', question_count: 3, completed_count: 0, correct_count: 0, status: 'active', current_sort: 2, question_id: 'question-3', sort: 3, normalized_type: 'yes_no', content: 'Judge', answered: false, is_correct: null, draft_answer: 'true', marked_for_review: false },
    ],
    [
      { id: 'option-a', question_id: 'question-2', sort: 1, content: 'A' },
      { id: 'option-b', question_id: 'question-2', sort: 2, content: 'B' },
    ],
  ]);
  const repository = createPgPracticeRepository(client);

  const result = await repository.getSession({ studentId: 'student-1', sessionId: 'session-1' });

  expect(result?.session.currentSort).toBe(2);
  expect(result?.questions.map((question) => [question.type, question.draftAnswer, question.markedForReview])).toEqual([
    ['single_choice', undefined, false],
    ['multiple_choice', ['A', 'B'], true],
    ['yes_no', true, false],
  ]);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -w @bkyexam-practice/api -- tests/practice/repository.test.ts`

Expected: FAIL because DTOs and SQL do not include `currentSort`, `draftAnswer`, or `markedForReview`.

- [ ] **Step 3: Extend DTOs and row types**

Update `PracticeQuestionDto`:

```ts
export interface PracticeQuestionDto {
  id: string;
  sort: number;
  type: string;
  content: string;
  options: { id: string; sort: number; content: string }[];
  answered: boolean;
  isCorrect?: boolean | null;
  draftAnswer?: SubmittedAnswer;
  markedForReview: boolean;
}
```

Update `PracticeSessionDto`:

```ts
currentSort: number;
```

Extend `SessionRow` and `SessionQuestionRow` with:

```ts
current_sort: number | string;
is_correct?: boolean | null;
draft_answer?: string | null;
marked_for_review?: boolean | null;
```

- [ ] **Step 4: Read drafts and review flags in `getSession`**

Change the session select to include `current_sort`. Change the question query to left-join drafts:

```sql
LEFT JOIN practice_session_drafts
  ON practice_session_drafts.session_id = practice_session_questions.session_id
  AND practice_session_drafts.question_id = practice_session_questions.question_id
  AND practice_session_drafts.student_id = practice_sessions.student_id
```

Select these columns:

```sql
practice_sessions.current_sort,
practice_session_questions.is_correct,
practice_session_drafts.draft_answer,
COALESCE(practice_session_drafts.marked_for_review, false) AS marked_for_review
```

Map each question with:

```ts
draftAnswer: parseStoredAnswer(row.draft_answer),
markedForReview: row.marked_for_review === true,
isCorrect: row.is_correct ?? null,
```

Add this parser near `serializeSubmittedAnswer`:

```ts
function parseStoredAnswer(answer: string | null | undefined): SubmittedAnswer | undefined {
  if (!answer) return undefined;
  if (answer === 'true') return true;
  if (answer === 'false') return false;
  try {
    const parsed = JSON.parse(answer) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
  } catch {
    return answer;
  }
  return answer;
}
```

- [ ] **Step 5: Update `createSession` and memory repository defaults**

Ensure new sessions return `currentSort: 1` and questions return `markedForReview: false`.

```ts
const session: PracticeSessionDto = {
  id: randomUUID(),
  bankId,
  mode,
  questionCount: 0,
  completedCount: 0,
  correctCount: 0,
  currentSort: 1,
  status: 'active',
};
```

- [ ] **Step 6: Run repository tests**

Run: `npm run test -w @bkyexam-practice/api -- tests/practice/repository.test.ts`

Expected: PASS after updating existing expected payloads with `currentSort: 1` and `markedForReview: false`.

---

### Task 3: Drafts, Review Flags, Active Sessions, And Progress Repository Methods

**Files:**
- Modify: `apps/api/src/practice/repository.ts`
- Modify: `apps/api/tests/practice/repository.test.ts`

- [ ] **Step 1: Write failing tests for new methods**

Add tests that call these methods on `createPgPracticeRepository(client)`:

```ts
await repository.saveDraft({ studentId: 'student-1', sessionId: 'session-1', questionId: 'question-1', answer: ['A'] });
await repository.setReviewFlag({ studentId: 'student-1', sessionId: 'session-1', questionId: 'question-1', markedForReview: true });
await repository.saveProgress({ studentId: 'student-1', sessionId: 'session-1', currentSort: 3 });
const active = await repository.listActiveSessions({ studentId: 'student-1' });
```

Assert SQL contains:

```ts
expect(client.calls.some((call) => call.sql.includes('INSERT INTO practice_session_drafts'))).toBe(true);
expect(client.calls.some((call) => call.sql.includes('marked_for_review = EXCLUDED.marked_for_review'))).toBe(true);
expect(client.calls.some((call) => call.sql.includes('SET current_sort = $3'))).toBe(true);
expect(client.calls.some((call) => call.sql.includes("practice_sessions.status = 'active'"))).toBe(true);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -w @bkyexam-practice/api -- tests/practice/repository.test.ts`

Expected: FAIL because the methods are not in `PracticeRepository`.

- [ ] **Step 3: Extend `PracticeRepository` interface**

Add methods:

```ts
listActiveSessions(input: { studentId: string }): Promise<PracticeSessionDto[]>;
saveProgress(input: { studentId: string; sessionId: string; currentSort: number }): Promise<PracticeSessionDto | null>;
saveDraft(input: { studentId: string; sessionId: string; questionId: string; answer: SubmittedAnswer }): Promise<PracticeQuestionDto | null>;
clearDraft(input: { studentId: string; sessionId: string; questionId: string }): Promise<boolean>;
setReviewFlag(input: { studentId: string; sessionId: string; questionId: string; markedForReview: boolean }): Promise<PracticeQuestionDto | null>;
```

- [ ] **Step 4: Implement PostgreSQL methods with ownership checks**

Use `practice_sessions.student_id = $1`, `practice_sessions.status = 'active'`, and a join to `practice_session_questions` for draft/review changes. Save draft using:

```sql
INSERT INTO practice_session_drafts (session_id, question_id, student_id, draft_answer, marked_for_review, updated_at)
SELECT practice_sessions.id, practice_session_questions.question_id, practice_sessions.student_id, $4, false, now()
FROM practice_sessions
JOIN practice_session_questions ON practice_session_questions.session_id = practice_sessions.id
WHERE practice_sessions.student_id = $1
  AND practice_sessions.id = $2
  AND practice_session_questions.question_id = $3
  AND practice_sessions.status = 'active'
ON CONFLICT (session_id, question_id) DO UPDATE SET
  draft_answer = EXCLUDED.draft_answer,
  updated_at = now()
RETURNING question_id, draft_answer, marked_for_review
```

Use `serializeSubmittedAnswer(input.answer)` as `$4`.

- [ ] **Step 5: Implement memory repository methods**

Store draft answers and review flags on in-memory question objects. Return `null` when the session or question is missing, and reject completed sessions by returning `null` for draft/progress changes.

- [ ] **Step 6: Run repository tests**

Run: `npm run test -w @bkyexam-practice/api -- tests/practice/repository.test.ts`

Expected: PASS.

---

### Task 4: Whole-Session Submission Repository Method

**Files:**
- Modify: `apps/api/src/practice/repository.ts`
- Modify: `apps/api/tests/practice/repository.test.ts`

- [ ] **Step 1: Write failing tests for whole-session submission**

Add a test for `submitSession`:

```ts
const result = await repository.submitSession({ studentId: 'student-1', sessionId: 'session-1' });

expect(result?.session).toEqual({
  id: 'session-1',
  bankId: 'bank-1',
  mode: 'random',
  questionCount: 2,
  completedCount: 2,
  correctCount: 1,
  currentSort: 1,
  status: 'completed',
});
expect(result?.results.map((item) => [item.questionId, item.isCorrect])).toEqual([
  ['question-1', true],
  ['question-2', false],
]);
```

Assert repository SQL inserts attempts for all answered draft rows, upserts wrong questions for incorrect rows, updates session questions, and marks the session completed.

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -w @bkyexam-practice/api -- tests/practice/repository.test.ts`

Expected: FAIL because `submitSession` does not exist.

- [ ] **Step 3: Add `submitSession` to `PracticeRepository`**

```ts
submitSession(input: {
  studentId: string;
  sessionId: string;
}): Promise<{ session: PracticeSessionDto; results: PracticeAnswerResultDto[] } | null>;
```

- [ ] **Step 4: Implement `submitSession` transaction**

Inside one transaction:

```sql
SELECT
  practice_sessions.id AS session_id,
  practice_sessions.bank_id,
  practice_sessions.mode,
  practice_sessions.question_count,
  practice_sessions.current_sort,
  practice_sessions.status,
  practice_session_questions.id AS session_question_id,
  practice_session_questions.question_id,
  questions.normalized_type,
  questions.answer_raw,
  practice_session_drafts.draft_answer
FROM practice_sessions
JOIN practice_session_questions ON practice_session_questions.session_id = practice_sessions.id
JOIN questions ON questions.id = practice_session_questions.question_id
LEFT JOIN practice_session_drafts
  ON practice_session_drafts.session_id = practice_sessions.id
  AND practice_session_drafts.question_id = practice_session_questions.question_id
  AND practice_session_drafts.student_id = practice_sessions.student_id
WHERE practice_sessions.id = $1
  AND practice_sessions.student_id = $2
ORDER BY practice_session_questions.sort
FOR UPDATE OF practice_sessions, practice_session_questions
```

For each row with a non-empty `draft_answer`, parse and grade it with existing `gradeAnswer`, insert a `practice_attempts` row, update `practice_session_questions.answered_at/is_correct`, and upsert `wrong_questions` only when `grade.isCorrect === false`.

Update the session at the end:

```sql
UPDATE practice_sessions
SET completed_count = $2,
    correct_count = $3,
    status = 'completed',
    completed_at = COALESCE(completed_at, now()),
    updated_at = now()
WHERE id = $1
RETURNING id, bank_id, mode, question_count, completed_count, correct_count, current_sort, status
```

- [ ] **Step 5: Keep old `submitAnswer` available**

Do not remove `submitAnswer` in this task. The web app will stop calling it later, but existing tests and compatibility remain intact.

- [ ] **Step 6: Run repository tests**

Run: `npm run test -w @bkyexam-practice/api -- tests/practice/repository.test.ts`

Expected: PASS.

---

### Task 5: Practice Routes For New API Behavior

**Files:**
- Modify: `apps/api/src/routes/practice.ts`
- Modify: `apps/api/tests/routes/practice.test.ts`

- [ ] **Step 1: Write failing route tests**

Extend the fake repository with arrays for `savedDrafts`, `reviewFlags`, `savedProgress`, and `submittedSessions`. Add tests for:

```ts
GET /api/practice/sessions/active
PATCH /api/practice/sessions/:sessionId/progress
PUT /api/practice/sessions/:sessionId/drafts/:questionId
DELETE /api/practice/sessions/:sessionId/drafts/:questionId
PATCH /api/practice/sessions/:sessionId/review/:questionId
POST /api/practice/sessions/:sessionId/submit
```

Example expectation for draft save:

```ts
expect(savedDrafts).toEqual([{ studentId: 'student-1', sessionId, questionId, answer: ['option-1'] }]);
```

Example expectation for whole-session submit:

```ts
expect(submittedSessions).toEqual([{ studentId: 'student-1', sessionId }]);
```

- [ ] **Step 2: Run route tests to verify failure**

Run: `npm run test -w @bkyexam-practice/api -- tests/routes/practice.test.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Add route handlers**

Add handlers after `GET /api/practice/sessions/:sessionId` and before the compatibility `answers` route.

Validation rules:

- `sessionId` and `questionId` must be canonical UUIDs.
- `progress.currentSort` must be an integer from `1` to `200`.
- draft `answer` must pass existing `isSubmittedAnswer`.
- review body must be `{ markedForReview: boolean }`.

Use existing `CompletedSessionError` mapping to return `409` for completed sessions where repository methods throw it.

- [ ] **Step 4: Run route tests**

Run: `npm run test -w @bkyexam-practice/api -- tests/routes/practice.test.ts`

Expected: PASS.

---

### Task 6: Web Pure Helpers For Sectioned Practice

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add tests for helpers:

```ts
expect(groupQuestionsByType(sampleQuestions).map((section) => section.label)).toEqual(['单选题', '多选题', '判断题']);
expect(getAnsweredCount(sampleQuestions, answersByQuestion)).toBe(2);
expect(getUnansweredCount(sampleQuestions, answersByQuestion)).toBe(1);
expect(getQuestionState(question, answersByQuestion, reviewFlags)).toBe('answered-review');
expect(buildSectionScores(sampleQuestions, resultsByQuestion)).toEqual([
  { type: 'single_choice', label: '单选题', correctCount: 1, totalCount: 1 },
]);
```

- [ ] **Step 2: Run web tests to verify failure**

Run: `npm run test -w @bkyexam-practice/web -- src/App.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Add exported helper functions**

Add these constants and helpers to `apps/web/src/App.tsx`:

```ts
const practiceSections = [
  { type: 'single_choice', label: '单选题' },
  { type: 'multiple_choice', label: '多选题' },
  { type: 'yes_no', label: '判断题' },
] as const;

export function groupQuestionsByType(questions: PracticeQuestion[]) {
  return practiceSections
    .map((section) => ({ ...section, questions: questions.filter((question) => question.type === section.type) }))
    .filter((section) => section.questions.length > 0);
}

export function getAnsweredCount(questions: PracticeQuestion[], answersByQuestion: Record<string, SavedAnswer>) {
  return questions.filter((question) => hasSubmittedAnswer(answersByQuestion[question.id])).length;
}

export function getUnansweredCount(questions: PracticeQuestion[], answersByQuestion: Record<string, SavedAnswer>) {
  return questions.length - getAnsweredCount(questions, answersByQuestion);
}

export function getQuestionState(
  question: PracticeQuestion,
  answersByQuestion: Record<string, SavedAnswer>,
  reviewFlags: Record<string, boolean>,
) {
  const answered = hasSubmittedAnswer(answersByQuestion[question.id]);
  const review = reviewFlags[question.id] === true;
  if (answered && review) return 'answered-review';
  if (answered) return 'answered';
  if (review) return 'review';
  return 'empty';
}
```

- [ ] **Step 4: Run web helper tests**

Run: `npm run test -w @bkyexam-practice/web -- src/App.test.ts`

Expected: PASS.

---

### Task 7: Frontend API Flow And Sectioned Practice UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Replace immediate scoring state with draft-first state**

Add state:

```ts
const [activeSectionType, setActiveSectionType] = useState<string>('single_choice');
const [reviewFlags, setReviewFlags] = useState<Record<string, boolean>>({});
const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
const [sessionResults, setSessionResults] = useState<Record<string, AnswerResult>>({});
const [userMenuOpen, setUserMenuOpen] = useState(false);
```

When creating or loading a session, initialize `answersByQuestion` from `question.draftAnswer`, initialize `reviewFlags` from `question.markedForReview`, and set `activeSectionType` from the first available section.

- [ ] **Step 2: Save drafts when answers change**

Create one function that updates local state and saves to the server:

```ts
async function saveDraft(questionId: string, answer: SavedAnswer) {
  if (!session) return;
  setAnswersByQuestion((items) => ({ ...items, [questionId]: answer }));
  setSaveState('saving');
  try {
    await api(`/api/practice/sessions/${session.id}/drafts/${questionId}`, {
      method: 'PUT',
      body: JSON.stringify({ answer }),
    });
    setSaveState('saved');
  } catch (error) {
    setSaveState('failed');
    setMessage(error instanceof Error ? error.message : '草稿保存失败，稍后会重试');
  }
}
```

Call `saveDraft` from option clicks and yes/no clicks instead of waiting for `提交答案`.

- [ ] **Step 3: Save current position and review flags**

In `goToQuestion`, after setting `currentIndex`, call:

```ts
void api(`/api/practice/sessions/${session.id}/progress`, {
  method: 'PATCH',
  body: JSON.stringify({ currentSort: nextQuestionItem.sort }),
});
```

Add review toggle:

```ts
async function toggleReviewFlag(questionId: string) {
  if (!session) return;
  const markedForReview = !reviewFlags[questionId];
  setReviewFlags((items) => ({ ...items, [questionId]: markedForReview }));
  await api(`/api/practice/sessions/${session.id}/review/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ markedForReview }),
  });
}
```

- [ ] **Step 4: Add whole-session submit**

Replace `submitAnswer` usage with:

```ts
async function submitSession() {
  if (!session) return;
  const unansweredCount = getUnansweredCount(questions, answersByQuestion);
  if (unansweredCount > 0 && !showSubmitConfirm) {
    setShowSubmitConfirm(true);
    return;
  }
  setLoading(true);
  setMessage('');
  try {
    const result = await api<{ session: PracticeSession; results: AnswerResult[] }>(`/api/practice/sessions/${session.id}/submit`, {
      method: 'POST',
      body: '{}',
    });
    setSession(result.session);
    setSessionResults(Object.fromEntries(result.results.map((item) => [item.questionId, item])));
    setResultsByQuestion(Object.fromEntries(result.results.map((item) => [item.questionId, item])));
    setShowSubmitConfirm(false);
    void loadWrongQuestions({ includeMastered });
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '交卷失败');
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 5: Render sectioned UI**

Render section tabs using `groupQuestionsByType(questions)`. The question map should show only the active section's questions. The current question card should show `标记存疑`, previous/next, save status, and no correctness result until `session.status === 'completed'`.

Use labels:

```text
草稿已保存
保存中...
草稿保存失败，稍后会重试
交卷并查看结果
还有 N 题未作答，确定交卷吗？
继续作答
仍然交卷
```

- [ ] **Step 6: Update home and logout menu**

Change the unauthenticated copy to the approved homepage copy. Add logged-in home cards for `继续练习`, `选择题库`, and `错题本`. Move `注销登录` inside the nickname menu. Ensure `返回题库` only calls `setView('banks')`.

- [ ] **Step 7: Add responsive styles**

Add CSS classes for `.home-grid`, `.user-menu`, `.section-tabs`, `.section-summary`, `.save-status`, `.review`, `.submit-confirm`, `.score-summary`, and mobile sticky `.question-actions`. Keep the existing visual language; do not introduce a new design system.

- [ ] **Step 8: Run web build and tests**

Run: `npm run test -w @bkyexam-practice/web -- src/App.test.ts`

Expected: PASS.

Run: `npm run build -w @bkyexam-practice/web`

Expected: Vite build succeeds.

---

### Task 8: Full Verification And Deployment Preparation

**Files:**
- Modify if needed: `docs/database.md`
- Modify if needed: `docs/architecture.md`

- [ ] **Step 1: Run full local verification**

Run from repo root:

```sh
npm run typecheck --workspaces
npm run test --workspaces
npm run build --workspaces
```

Expected: all commands exit `0`.

- [ ] **Step 2: Review diff for accidental unrelated changes**

Run:

```sh
git status --short
git diff -- apps/api apps/web docs
```

Expected: only the implementation, tests, migrations, styles, and relevant docs are changed.

- [ ] **Step 3: Update docs if behavior changed beyond the design doc**

If implementation adds the migration/table/API exactly as planned, update `docs/database.md` with:

```md
### practice_session_drafts

Stores unsubmitted practice answers and review flags for active sessions. Draft rows are scoped by `student_id`, `session_id`, and `question_id`. Drafts are not graded until the session-level submit endpoint is called.
```

Update `docs/architecture.md` with:

```md
Practice sessions use a draft-first flow. The web app saves choices and review flags while students move through sectioned single-choice, multiple-choice, and yes/no question groups. The API grades the session only when `/api/practice/sessions/:sessionId/submit` is called.
```

- [ ] **Step 4: Prepare server deployment commands after user approval**

Do not deploy until the user confirms. The expected deployment sequence is:

```sh
scp -r apps package.json package-lock.json docs miku:/srv/bkyexam-practice-platform/__upload_tmp__/
ssh miku 'cd /srv/bkyexam-practice-platform && npm run typecheck --workspaces && npm run test --workspaces && npm run build --workspaces'
ssh miku 'cd /srv/bkyexam-practice-platform && set -a && . /etc/bkyexam-practice-api.env && set +a && npm run migrate -w @bkyexam-practice/api'
ssh miku 'sudo systemctl restart bkyexam-practice-api.service && systemctl is-active bkyexam-practice-api.service'
```

- [ ] **Step 5: Browser QA after deployment**

Verify on `https://exam.acgbot.cc.cd`:

- Login with a test username.
- Start a practice session.
- Confirm sections show separately as `单选题`, `多选题`, `判断题` when those types exist.
- Select answers, refresh, and confirm drafts restore.
- Mark a question as `存疑`, refresh, and confirm the flag restores.
- Return to `题库` and confirm the user remains logged in.
- Submit with unanswered questions and confirm the warning appears.
- Submit anyway and confirm total/per-section results plus read-only completed state.
- Open mobile viewport and confirm the sticky action bar and section selector are usable.

---

## Self-Review

Spec coverage:

- Homepage and username warning are covered in Task 7.
- Logged-in dashboard and top navigation are covered in Task 7.
- Return-to-bank without logout and nickname-menu logout are covered in Task 7.
- Server-side drafts, current position, and resume data are covered in Tasks 1, 2, 3, 5, and 7.
- Separate `单选题`, `多选题`, and `判断题` sections are covered in Tasks 2, 6, and 7.
- `标记存疑` is covered in Tasks 1, 3, 5, 6, and 7.
- Whole-session grading is covered in Tasks 4, 5, and 7.
- Mobile practice layout is covered in Task 7 and browser QA in Task 8.
- Full routing remains out of scope and is not implemented in this plan.

Placeholder scan:

- This plan defines exact files, routes, commands, data fields, and expected verification output.

Type consistency:

- `currentSort` maps to SQL `current_sort`.
- `markedForReview` maps to SQL `marked_for_review`.
- `draftAnswer` maps to SQL `draft_answer`.
- `submitSession`, `saveDraft`, `setReviewFlag`, `saveProgress`, and `listActiveSessions` are consistently named across repository, routes, and frontend API calls.
