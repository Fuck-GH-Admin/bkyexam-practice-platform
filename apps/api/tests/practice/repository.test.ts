import { describe, expect, it } from 'vitest';
import type { QueryClient } from '../../src/db/client';
import { CompletedSessionError, createMemoryPracticeRepository, createPgPracticeRepository } from '../../src/practice/repository';

class FakeQueryClient implements QueryClient {
  calls: { sql: string; params?: readonly unknown[] }[] = [];

  constructor(private readonly results: (unknown[] | Error)[] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.calls.push({ sql, params });
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql.trim())) {
      return { rows: [] };
    }

    const result = this.results.shift() ?? [];
    if (result instanceof Error) {
      throw result;
    }

    return { rows: result };
  }
}

class FakePoolClient extends FakeQueryClient {
  released = false;

  release() {
    this.released = true;
  }
}

class FakePoolLikeClient implements QueryClient {
  calls: { sql: string; params?: readonly unknown[] }[] = [];
  readonly checkedOutClient: FakePoolClient;

  constructor(results: (unknown[] | Error)[] = []) {
    this.checkedOutClient = new FakePoolClient(results);
  }

  async query(sql: string, params?: readonly unknown[]) {
    this.calls.push({ sql, params });
    return { rows: [] };
  }

  async connect() {
    return this.checkedOutClient;
  }
}

function createSessionResults() {
  return [
    [{ bank_id: 'bank-1' }],
    [
      { id: 'question-1', normalized_type: 'single_choice', content: 'Question 1' },
      { id: 'question-2', normalized_type: 'yes_no', content: 'Question 2' },
    ],
    [
      { id: 'option-1', question_id: 'question-1', sort: 1, content: 'A' },
      { id: 'option-2', question_id: 'question-1', sort: 2, content: 'B' },
    ],
    [
      {
        id: 'session-1',
        bank_id: 'bank-1',
        mode: 'random',
        question_count: 2,
        completed_count: 0,
        correct_count: 0,
        current_sort: 1,
        status: 'active',
      },
    ],
    [],
  ];
}

function createSubmitAnswerResults() {
  return [
    [
      {
        session_id: 'session-1',
        bank_id: 'bank-1',
        status: 'active',
        question_count: 2,
        session_question_id: 'session-question-1',
        question_id: 'question-1',
        normalized_type: 'single_choice',
        answer_raw: 'A',
      },
    ],
    [],
    [],
    [
      {
        id: 'session-1',
        completed_count: 1,
        correct_count: 1,
        status: 'active',
      },
    ],
  ];
}

function createSubmitSessionRows() {
  return [
    {
      session_id: 'session-1',
      bank_id: 'bank-1',
      mode: 'random',
      question_count: 2,
      current_sort: 1,
      status: 'active',
      session_question_id: 'session-question-1',
      question_id: 'question-1',
      normalized_type: 'single_choice',
      answer_raw: 'A',
      draft_answer: '["A"]',
    },
    {
      session_id: 'session-1',
      bank_id: 'bank-1',
      mode: 'random',
      question_count: 2,
      current_sort: 1,
      status: 'active',
      session_question_id: 'session-question-2',
      question_id: 'question-2',
      normalized_type: 'yes_no',
      answer_raw: '11111111-1111-1111-1111-111111111111',
      draft_answer: 'false',
    },
  ];
}

function createSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    bank_id: 'bank-1',
    mode: 'sequential',
    question_count: 2,
    completed_count: 1,
    correct_count: 1,
    current_sort: 2,
    status: 'active',
    ...overrides,
  };
}

function createSessionQuestionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    bank_id: 'bank-1',
    mode: 'sequential',
    question_count: 2,
    completed_count: 1,
    correct_count: 1,
    current_sort: 2,
    status: 'active',
    question_id: 'question-1',
    sort: 2,
    normalized_type: 'multiple_choice',
    content: 'Question 1 content',
    answered: true,
    is_correct: false,
    draft_answer: '["A"]',
    marked_for_review: false,
    ...overrides,
  };
}

describe('createPgPracticeRepository', () => {
  it('checks visible bank mappings before creating a session', async () => {
    const client = new FakeQueryClient(createSessionResults());
    const repository = createPgPracticeRepository(client);

    await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice', 'yes_no'],
    });

    expect(client.calls[0].sql).toContain('FROM bank_mappings');
    expect(client.calls[0].sql).toContain('bank_id = $1');
    expect(client.calls[0].sql).toContain('visible = true');
    expect(client.calls[0].sql).toContain('LIMIT 1');
    expect(client.calls[0].params).toEqual(['bank-1']);
  });

  it('uses a recursive classification CTE and random ordering for random sessions', async () => {
    const client = new FakeQueryClient(createSessionResults());
    const repository = createPgPracticeRepository(client);

    await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice', 'yes_no'],
    });

    const questionQuery = client.calls.find((call) => call.sql.includes('WITH RECURSIVE bank_classifications'));
    expect(questionQuery).toBeDefined();
    expect(questionQuery.sql).toContain('WITH RECURSIVE bank_classifications');
    expect(questionQuery.sql).toContain('classifications.parent_id = bank_classifications.id');
    expect(questionQuery.sql).toContain('questions.normalized_type = ANY($2::text[])');
    expect(questionQuery.sql).toContain('question_quality_flags.excluded_from_practice = true');
    expect(questionQuery.sql).toContain('ORDER BY random()');
    expect(questionQuery.params).toEqual(['bank-1', ['single_choice', 'yes_no'], 2]);
  });

  it('uses deterministic ordering for sequential sessions', async () => {
    const client = new FakeQueryClient(createSessionResults());
    const repository = createPgPracticeRepository(client);

    await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 2,
      questionTypes: ['single_choice'],
    });

    const questionQuery = client.calls.find((call) => call.sql.includes('WITH RECURSIVE bank_classifications'));
    expect(questionQuery).toBeDefined();
    expect(questionQuery.sql).toContain('ORDER BY questions.id');
    expect(questionQuery.sql).not.toContain('ORDER BY random()');
  });

  it('inserts the practice session and locked session questions', async () => {
    const client = new FakeQueryClient(createSessionResults());
    const repository = createPgPracticeRepository(client);

    const result = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice', 'yes_no'],
    });

    const sessionInsert = client.calls.find((call) => call.sql.includes('INSERT INTO practice_sessions'));
    const sessionQuestionsInsert = client.calls.find((call) => call.sql.includes('INSERT INTO practice_session_questions'));
    expect(sessionInsert?.params).toEqual(['student-1', 'bank-1', 'random', 2, 2]);
    expect(sessionQuestionsInsert?.params).toEqual(['session-1', 'question-1', 1, 'question-2', 2]);
    expect(result).toEqual({
      session: {
        id: 'session-1',
        bankId: 'bank-1',
        mode: 'random',
        questionCount: 2,
        completedCount: 0,
        correctCount: 0,
        currentSort: 1,
        status: 'active',
      },
      questions: [
        {
          id: 'question-1',
          sort: 1,
          type: 'single_choice',
          content: 'Question 1',
          options: [
            { id: 'option-1', sort: 1, content: 'A' },
            { id: 'option-2', sort: 2, content: 'B' },
          ],
          answered: false,
          markedForReview: false,
        },
        {
          id: 'question-2',
          sort: 2,
          type: 'yes_no',
          content: 'Question 2',
          options: [],
          answered: false,
          markedForReview: false,
        },
      ],
    });
  });

  it('wraps practice session creation inserts in a transaction', async () => {
    const client = new FakeQueryClient(createSessionResults());
    const repository = createPgPracticeRepository(client);

    await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice', 'yes_no'],
    });

    const beginIndex = client.calls.findIndex((call) => call.sql.trim() === 'BEGIN');
    const sessionInsertIndex = client.calls.findIndex((call) => call.sql.includes('INSERT INTO practice_sessions'));
    const sessionQuestionsInsertIndex = client.calls.findIndex((call) => call.sql.includes('INSERT INTO practice_session_questions'));
    const commitIndex = client.calls.findIndex((call) => call.sql.trim() === 'COMMIT');

    expect(beginIndex).toBeGreaterThan(-1);
    expect(beginIndex).toBeLessThan(sessionInsertIndex);
    expect(sessionInsertIndex).toBeLessThan(sessionQuestionsInsertIndex);
    expect(sessionQuestionsInsertIndex).toBeLessThan(commitIndex);
  });

  it('rolls back and rethrows when locking session questions fails', async () => {
    const client = new FakeQueryClient([
      ...createSessionResults().slice(0, 4),
      new Error('lock failed'),
      [],
    ]);
    const repository = createPgPracticeRepository(client);

    await expect(repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice', 'yes_no'],
    })).rejects.toThrow('lock failed');

    expect(client.calls.some((call) => call.sql.trim() === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((call) => call.sql.trim() === 'COMMIT')).toBe(false);
  });

  it('uses a checked-out client for transaction queries when constructed with a pool-like client', async () => {
    const pool = new FakePoolLikeClient(createSessionResults());
    const repository = createPgPracticeRepository(pool);

    await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice', 'yes_no'],
    });

    expect(pool.calls).toEqual([]);
    expect(pool.checkedOutClient.calls.some((call) => call.sql.includes('INSERT INTO practice_sessions'))).toBe(true);
    expect(pool.checkedOutClient.calls.some((call) => call.sql.trim() === 'COMMIT')).toBe(true);
    expect(pool.checkedOutClient.released).toBe(true);
  });

  it('returns null when the bank is hidden or missing', async () => {
    const client = new FakeQueryClient([[]]);
    const repository = createPgPracticeRepository(client);

    await expect(repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice'],
    })).resolves.toBeNull();
  });

  it('returns grouped session details with progress, drafts, and review markers', async () => {
    const client = new FakeQueryClient([
      [
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'sequential',
          question_count: 3,
          completed_count: 1,
          correct_count: 1,
          current_sort: 2,
          status: 'active',
        },
      ],
      [
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'sequential',
          question_count: 3,
          completed_count: 1,
          correct_count: 1,
          current_sort: 2,
          status: 'active',
          question_id: 'question-1',
          sort: 1,
          normalized_type: 'single_choice',
          content: 'Question 1',
          answered: false,
          is_correct: null,
          draft_answer: null,
          marked_for_review: false,
        },
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'sequential',
          question_count: 3,
          completed_count: 1,
          correct_count: 1,
          current_sort: 2,
          status: 'active',
          question_id: 'question-2',
          sort: 2,
          normalized_type: 'multiple_choice',
          answer_raw: 'A,B',
          content: 'Question 2',
          answered: true,
          is_correct: true,
          draft_answer: '["A","B"]',
          marked_for_review: true,
        },
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'sequential',
          question_count: 3,
          completed_count: 1,
          correct_count: 1,
          current_sort: 2,
          status: 'active',
          question_id: 'question-3',
          sort: 3,
          normalized_type: 'yes_no',
          answer_raw: '11111111-1111-1111-1111-111111111111',
          content: 'Question 3',
          answered: false,
          is_correct: null,
          draft_answer: 'true',
          marked_for_review: false,
        },
      ],
      [
        { id: 'option-1', question_id: 'question-2', sort: 1, content: 'A' },
        { id: 'option-2', question_id: 'question-2', sort: 2, content: 'B' },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.getSession({ studentId: 'student-1', sessionId: 'session-1' });

    expect(result?.session.currentSort).toBe(2);
    expect(result?.questions.map((question) => [
      question.type,
      question.draftAnswer,
      question.markedForReview,
    ])).toEqual([
      ['single_choice', undefined, false],
      ['multiple_choice', ['A', 'B'], true],
      ['yes_no', true, false],
    ]);
    expect(result?.questions[1]).toMatchObject({
      correctAnswer: ['A', 'B'],
      needsSelfReview: false,
    });
    expect(result?.questions[2]).not.toHaveProperty('correctAnswer');
  });

  it('submits an answer, records the attempt, and updates session progress from answered rows', async () => {
    const client = new FakeQueryClient([
      [
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          status: 'active',
          question_count: 2,
          session_question_id: 'session-question-1',
          question_id: 'question-1',
          normalized_type: 'single_choice',
          answer_raw: 'A',
        },
      ],
      [],
      [],
      [
        {
          id: 'session-1',
          completed_count: 1,
          correct_count: 1,
          status: 'active',
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: ['A'],
    });

    const attemptInsert = client.calls.find((call) => call.sql.includes('INSERT INTO practice_attempts'));
    const sessionQuestionUpdate = client.calls.find((call) => call.sql.includes('UPDATE practice_session_questions'));
    const progressUpdate = client.calls.find((call) => call.sql.includes('COUNT(*) FILTER (WHERE answered_at IS NOT NULL)'));
    expect(attemptInsert?.params).toEqual([
      expect.any(String),
      'student-1',
      'question-1',
      'bank-1',
      '["A"]',
      true,
    ]);
    expect(sessionQuestionUpdate?.params).toEqual(['session-question-1', true]);
    expect(progressUpdate?.sql).toContain('::integer AS completed_count');
    expect(progressUpdate?.sql).toContain('COUNT(*) FILTER (WHERE is_correct = true)');
    expect(result).toEqual({
      result: {
        questionId: 'question-1',
        isCorrect: true,
        correctAnswer: ['A'],
        needsSelfReview: false,
      },
      session: { completedCount: 1, correctCount: 1, status: 'active' },
    });
  });

  it('stores formal string answer submissions as raw strings', async () => {
    const client = new FakeQueryClient(createSubmitAnswerResults());
    const repository = createPgPracticeRepository(client);

    await repository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: 'A',
    });

    const attemptInsert = client.calls.find((call) => call.sql.includes('INSERT INTO practice_attempts'));

    expect(attemptInsert?.params?.[4]).toBe('A');
  });

  it('upserts a wrong-question row when an objective answer is incorrect', async () => {
    const client = new FakeQueryClient([
      [
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          status: 'active',
          question_count: 2,
          session_question_id: 'session-question-1',
          question_id: 'question-1',
          normalized_type: 'single_choice',
          answer_raw: 'A',
        },
      ],
      [],
      [],
      [],
      [
        {
          id: 'session-1',
          completed_count: 1,
          correct_count: 0,
          status: 'active',
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    await repository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: 'B',
    });

    const attemptInsert = client.calls.find((call) => call.sql.includes('INSERT INTO practice_attempts'));
    const wrongQuestionUpsert = client.calls.find((call) => call.sql.includes('INSERT INTO wrong_questions'));

    expect(attemptInsert?.params?.[4]).toBe('B');

    expect(wrongQuestionUpsert?.sql).toContain('ON CONFLICT (student_id, question_id, bank_id) DO UPDATE');
    expect(wrongQuestionUpsert?.sql).toContain('wrong_count = wrong_questions.wrong_count + 1');
    expect(wrongQuestionUpsert?.params).toEqual([
      expect.any(String),
      'student-1',
      'question-1',
      'bank-1',
      'B',
    ]);
  });

  it('does not write wrong questions for correct or self-review answers', async () => {
    const correctClient = new FakeQueryClient(createSubmitAnswerResults());
    const correctRepository = createPgPracticeRepository(correctClient);

    await correctRepository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: ['A'],
    });

    expect(correctClient.calls.some((call) => call.sql.includes('INSERT INTO wrong_questions'))).toBe(false);

    const selfReviewClient = new FakeQueryClient([
      [
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          status: 'active',
          question_count: 2,
          session_question_id: 'session-question-1',
          question_id: 'question-1',
          normalized_type: 'fill_blank',
          answer_raw: 'reference',
        },
      ],
      [],
      [],
      [
        {
          id: 'session-1',
          completed_count: 1,
          correct_count: 0,
          status: 'active',
        },
      ],
    ]);
    const selfReviewRepository = createPgPracticeRepository(selfReviewClient);

    await selfReviewRepository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: 'student answer',
    });

    expect(selfReviewClient.calls.some((call) => call.sql.includes('INSERT INTO wrong_questions'))).toBe(false);
  });

  it('wraps answer submission in a transaction', async () => {
    const client = new FakeQueryClient(createSubmitAnswerResults());
    const repository = createPgPracticeRepository(client);

    await repository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: ['A'],
    });

    const beginIndex = client.calls.findIndex((call) => call.sql.trim() === 'BEGIN');
    const attemptInsertIndex = client.calls.findIndex((call) => call.sql.includes('INSERT INTO practice_attempts'));
    const progressUpdateIndex = client.calls.findIndex((call) => call.sql.includes('COUNT(*) FILTER (WHERE answered_at IS NOT NULL)'));
    const commitIndex = client.calls.findIndex((call) => call.sql.trim() === 'COMMIT');

    expect(beginIndex).toBeGreaterThan(-1);
    expect(beginIndex).toBeLessThan(attemptInsertIndex);
    expect(attemptInsertIndex).toBeLessThan(progressUpdateIndex);
    expect(progressUpdateIndex).toBeLessThan(commitIndex);
  });

  it('rolls back and rethrows when answer submission fails after recording the attempt', async () => {
    const client = new FakeQueryClient([
      ...createSubmitAnswerResults().slice(0, 2),
      new Error('answer update failed'),
      [],
    ]);
    const repository = createPgPracticeRepository(client);

    await expect(repository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: ['A'],
    })).rejects.toThrow('answer update failed');

    expect(client.calls.some((call) => call.sql.includes('INSERT INTO practice_attempts'))).toBe(true);
    expect(client.calls.some((call) => call.sql.trim() === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((call) => call.sql.trim() === 'COMMIT')).toBe(false);
  });

  it('locks the session and session question rows when loading answer metadata', async () => {
    const client = new FakeQueryClient(createSubmitAnswerResults());
    const repository = createPgPracticeRepository(client);

    await repository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: ['A'],
    });

    const loadQuery = client.calls.find((call) => call.sql.includes('questions.answer_raw'));

    expect(loadQuery?.sql).toContain('FOR UPDATE');
    expect(loadQuery?.sql).toContain('practice_sessions');
    expect(loadQuery?.sql).toContain('practice_session_questions');
  });

  it('rejects answer submission for completed sessions', async () => {
    const client = new FakeQueryClient([
      [
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          status: 'completed',
          question_count: 1,
          session_question_id: 'session-question-1',
          question_id: 'question-1',
          normalized_type: 'yes_no',
          answer_raw: '对',
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    await expect(repository.submitAnswer({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: true,
    })).rejects.toBeInstanceOf(CompletedSessionError);
  });

  it('submits all drafted answers, records attempts, upserts wrong questions, and completes the session', async () => {
    const client = new FakeQueryClient([
      createSubmitSessionRows(),
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 2,
          completed_count: 2,
          correct_count: 1,
          current_sort: 1,
          status: 'completed',
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: 'session-1' });

    const loadQuery = client.calls.find((call) => call.sql.includes('practice_session_drafts.draft_answer'));
    const attemptInserts = client.calls.filter((call) => call.sql.includes('INSERT INTO practice_attempts'));
    const sessionQuestionUpdates = client.calls.filter((call) => call.sql.includes('UPDATE practice_session_questions'));
    const wrongQuestionUpserts = client.calls.filter((call) => call.sql.includes('INSERT INTO wrong_questions'));
    const sessionUpdate = client.calls.find((call) => call.sql.includes("status = 'completed'"));

    expect(loadQuery?.sql).toContain('FOR UPDATE OF practice_sessions, practice_session_questions');
    expect(loadQuery?.params).toEqual(['session-1', 'student-1']);
    expect(attemptInserts.map((call) => call.params)).toEqual([
      [expect.any(String), 'student-1', 'question-1', 'bank-1', '["A"]', true],
      [expect.any(String), 'student-1', 'question-2', 'bank-1', 'false', false],
    ]);
    expect(sessionQuestionUpdates.map((call) => call.params)).toEqual([
      ['session-question-1', true],
      ['session-question-2', false],
    ]);
    expect(wrongQuestionUpserts).toHaveLength(1);
    expect(wrongQuestionUpserts[0]?.params).toEqual([
      expect.any(String),
      'student-1',
      'question-2',
      'bank-1',
      'false',
    ]);
    expect(sessionUpdate?.sql).toContain('completed_count = $2');
    expect(sessionUpdate?.sql).toContain('correct_count = $3');
    expect(sessionUpdate?.params).toEqual(['session-1', 2, 1]);
    expect(result).toEqual({
      session: {
        id: 'session-1',
        bankId: 'bank-1',
        mode: 'random',
        questionCount: 2,
        completedCount: 2,
        correctCount: 1,
        currentSort: 1,
        status: 'completed',
      },
      results: [
        { questionId: 'question-1', isCorrect: true, correctAnswer: ['A'], needsSelfReview: false },
        { questionId: 'question-2', isCorrect: false, correctAnswer: true, needsSelfReview: false },
      ],
    });
  });

  it('ignores empty, whitespace-only, and empty-array drafts when submitting a session', async () => {
    const client = new FakeQueryClient([
      [
        ...createSubmitSessionRows(),
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 4,
          current_sort: 1,
          status: 'active',
          session_question_id: 'session-question-3',
          question_id: 'question-3',
          normalized_type: 'single_choice',
          answer_raw: 'A',
          draft_answer: '""',
        },
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 4,
          current_sort: 1,
          status: 'active',
          session_question_id: 'session-question-4',
          question_id: 'question-4',
          normalized_type: 'single_choice',
          answer_raw: 'A',
          draft_answer: '[]',
        },
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 5,
          current_sort: 1,
          status: 'active',
          session_question_id: 'session-question-5',
          question_id: 'question-5',
          normalized_type: 'single_choice',
          answer_raw: 'A',
          draft_answer: '"   "',
        },
      ],
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 4,
          completed_count: 2,
          correct_count: 1,
          current_sort: 1,
          status: 'completed',
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: 'session-1' });

    const attemptInserts = client.calls.filter((call) => call.sql.includes('INSERT INTO practice_attempts'));
    const sessionQuestionUpdates = client.calls.filter((call) => call.sql.includes('UPDATE practice_session_questions'));
    const wrongQuestionUpserts = client.calls.filter((call) => call.sql.includes('INSERT INTO wrong_questions'));
    const sessionUpdate = client.calls.find((call) => call.sql.includes("status = 'completed'"));

    expect(attemptInserts.map((call) => call.params?.[2])).toEqual(['question-1', 'question-2']);
    expect(sessionQuestionUpdates.map((call) => call.params?.[0])).toEqual(['session-question-1', 'session-question-2']);
    expect(wrongQuestionUpserts.map((call) => call.params?.[2])).toEqual(['question-2']);
    expect(sessionUpdate?.params).toEqual(['session-1', 2, 1]);
    expect(result?.session.completedCount).toBe(2);
    expect(result?.results.map((answer) => answer.questionId)).toEqual(['question-1', 'question-2']);
  });

  it('stores bulk-submitted string drafts as raw formal answers', async () => {
    const client = new FakeQueryClient([
      [
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 1,
          current_sort: 1,
          status: 'active',
          session_question_id: 'session-question-1',
          question_id: 'question-1',
          answered_at: null,
          is_correct: null,
          normalized_type: 'single_choice',
          answer_raw: 'A',
          draft_answer: '"A"',
        },
      ],
      [],
      [],
      [
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 1,
          completed_count: 1,
          correct_count: 1,
          current_sort: 1,
          status: 'completed',
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    await repository.submitSession({ studentId: 'student-1', sessionId: 'session-1' });

    const attemptInsert = client.calls.find((call) => call.sql.includes('INSERT INTO practice_attempts'));

    expect(attemptInsert?.params?.[4]).toBe('A');
  });

  it('includes existing answered questions when completing a session submission', async () => {
    const client = new FakeQueryClient([
      [
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 2,
          current_sort: 1,
          status: 'active',
          session_question_id: 'session-question-1',
          question_id: 'question-1',
          normalized_type: 'single_choice',
          answer_raw: 'A',
          answered_at: new Date('2026-01-01T00:00:00.000Z'),
          is_correct: true,
          draft_answer: '["B"]',
        },
        {
          session_id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 2,
          current_sort: 1,
          status: 'active',
          session_question_id: 'session-question-2',
          question_id: 'question-2',
          normalized_type: 'single_choice',
          answer_raw: 'A',
          answered_at: null,
          is_correct: null,
          draft_answer: '["B"]',
        },
      ],
      [],
      [],
      [],
      [
        {
          id: 'session-1',
          bank_id: 'bank-1',
          mode: 'random',
          question_count: 2,
          completed_count: 2,
          correct_count: 1,
          current_sort: 1,
          status: 'completed',
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: 'session-1' });

    const loadQuery = client.calls.find((call) => call.sql.includes('practice_session_drafts.draft_answer'));
    const attemptInserts = client.calls.filter((call) => call.sql.includes('INSERT INTO practice_attempts'));
    const sessionQuestionUpdates = client.calls.filter((call) => call.sql.includes('UPDATE practice_session_questions'));
    const sessionUpdate = client.calls.find((call) => call.sql.includes("status = 'completed'"));

    expect(loadQuery?.sql).toContain('practice_session_questions.answered_at');
    expect(loadQuery?.sql).toContain('practice_session_questions.is_correct');
    expect(attemptInserts.map((call) => call.params?.[2])).toEqual(['question-2']);
    expect(sessionQuestionUpdates.map((call) => call.params?.[0])).toEqual(['session-question-2']);
    expect(sessionUpdate?.params).toEqual(['session-1', 2, 1]);
    expect(result?.session.completedCount).toBe(2);
    expect(result?.session.correctCount).toBe(1);
    expect(result?.results.map((answer) => answer.questionId)).toEqual(['question-2']);
  });

  it('returns null when submitting a session that is missing or not owned by the student', async () => {
    const client = new FakeQueryClient([[]]);
    const repository = createPgPracticeRepository(client);

    await expect(repository.submitSession({ studentId: 'student-1', sessionId: 'session-1' })).resolves.toBeNull();

    expect(client.calls.some((call) => call.sql.trim() === 'COMMIT')).toBe(true);
    expect(client.calls.some((call) => call.sql.includes('INSERT INTO practice_attempts'))).toBe(false);
  });

  it('throws when submitting a completed owned session', async () => {
    const client = new FakeQueryClient([
      [
        {
          ...createSubmitSessionRows()[0],
          status: 'completed',
          answered_at: new Date('2026-01-01T00:00:00.000Z'),
          is_correct: true,
        },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    await expect(repository.submitSession({ studentId: 'student-1', sessionId: 'session-1' })).rejects.toThrow(CompletedSessionError);
    expect(client.calls.some((call) => call.sql.trim() === 'ROLLBACK')).toBe(true);
  });

  it('saves a draft for an active owned session question', async () => {
    const client = new FakeQueryClient([
      [{ question_id: 'question-1', draft_answer: '["A"]', marked_for_review: false }],
      [createSessionQuestionRow()],
      [
        { id: 'option-1', question_id: 'question-1', sort: 1, content: 'A' },
        { id: 'option-2', question_id: 'question-1', sort: 2, content: 'B' },
      ],
    ]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.saveDraft({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: ['A'],
    });

    expect(client.calls[0].sql).toContain('INSERT INTO practice_session_drafts');
    expect(client.calls[0].sql).toContain('JOIN practice_session_questions');
    expect(client.calls[0].sql).toContain('practice_sessions.student_id = $1');
    expect(client.calls[0].sql).toContain("practice_sessions.status = 'active'");
    expect(client.calls[0].sql).toContain('UPDATE practice_sessions');
    expect(client.calls[0].sql).toContain('SET updated_at = now()');
    expect(client.calls[0].params).toEqual(['student-1', 'session-1', 'question-1', '["A"]']);
    expect(result).toEqual({
      id: 'question-1',
      sort: 2,
      type: 'multiple_choice',
      content: 'Question 1 content',
      options: [
        { id: 'option-1', sort: 1, content: 'A' },
        { id: 'option-2', sort: 2, content: 'B' },
      ],
      answered: true,
      draftAnswer: ['A'],
      markedForReview: false,
      isCorrect: false,
    });
  });

  it('round-trips draft answer encodings without changing submitted types', async () => {
    const cases = [
      { answer: 'true', stored: '"true"' },
      { answer: 'false', stored: '"false"' },
      { answer: '["A"]', stored: '"[\\"A\\"]"' },
      { answer: 'A', stored: '"A"' },
      { answer: true, stored: 'true' },
      { answer: ['A'], stored: '["A"]' },
    ] as const;

    for (const { answer, stored } of cases) {
      const client = new FakeQueryClient([
        [{ question_id: 'question-1', draft_answer: stored, marked_for_review: false }],
        [createSessionQuestionRow({ draft_answer: stored })],
        [],
      ]);
      const repository = createPgPracticeRepository(client);

      const result = await repository.saveDraft({
        studentId: 'student-1',
        sessionId: 'session-1',
        questionId: 'question-1',
        answer,
      });

      expect(client.calls[0].params?.[3]).toEqual(stored);
      expect(result?.draftAnswer).toEqual(answer);
    }
  });

  it('clears a draft answer without dropping an existing review flag', async () => {
    const client = new FakeQueryClient([[{ question_id: 'question-1' }]]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.clearDraft({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
    });

    expect(client.calls[0].sql).toContain('practice_session_drafts');
    expect(client.calls[0].sql).toContain('marked_for_review = true');
    expect(client.calls[0].sql).toContain('DELETE FROM practice_session_drafts');
    expect(client.calls[0].sql).toContain("practice_sessions.status = 'active'");
    expect(client.calls[0].sql).toContain('UPDATE practice_sessions');
    expect(client.calls[0].sql).toContain('SET updated_at = now()');
    expect(client.calls[0].params).toEqual(['student-1', 'session-1', 'question-1']);
    expect(result).toBe(true);
  });

  it('sets a review flag for an active owned session question', async () => {
    const client = new FakeQueryClient([
      [{ question_id: 'question-1', draft_answer: 'typed answer', marked_for_review: true }],
      [createSessionQuestionRow({ draft_answer: 'typed answer', marked_for_review: true })],
      [{ id: 'option-1', question_id: 'question-1', sort: 1, content: 'A' }],
    ]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.setReviewFlag({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      markedForReview: true,
    });

    expect(client.calls[0].sql).toContain('INSERT INTO practice_session_drafts');
    expect(client.calls[0].sql).toContain('marked_for_review = EXCLUDED.marked_for_review');
    expect(client.calls[0].sql).toContain('COALESCE(practice_session_drafts.draft_answer');
    expect(client.calls[0].sql).toContain("practice_sessions.status = 'active'");
    expect(client.calls[0].sql).toContain('UPDATE practice_sessions');
    expect(client.calls[0].sql).toContain('SET updated_at = now()');
    expect(client.calls[0].params).toEqual(['student-1', 'session-1', 'question-1', true]);
    expect(result).toEqual({
      id: 'question-1',
      sort: 2,
      type: 'multiple_choice',
      content: 'Question 1 content',
      options: [{ id: 'option-1', sort: 1, content: 'A' }],
      answered: true,
      draftAnswer: 'typed answer',
      markedForReview: true,
      isCorrect: false,
    });
  });

  it('saves progress for an active owned session', async () => {
    const client = new FakeQueryClient([[createSessionRow({ current_sort: 3 })]]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.saveProgress({ studentId: 'student-1', sessionId: 'session-1', currentSort: 3 });

    expect(client.calls[0].sql).toContain('SET current_sort = $3');
    expect(client.calls[0].sql).toContain('practice_sessions.student_id = $1');
    expect(client.calls[0].sql).toContain('practice_session_questions.sort = $3');
    expect(client.calls[0].sql).toContain("status = 'active'");
    expect(client.calls[0].params).toEqual(['student-1', 'session-1', 3]);
    expect(result).toEqual({
      id: 'session-1',
      bankId: 'bank-1',
      mode: 'sequential',
      questionCount: 2,
      completedCount: 1,
      correctCount: 1,
      currentSort: 3,
      status: 'active',
    });
  });

  it('throws when mutating progress, drafts, or review flags for completed owned sessions', async () => {
    await expect(createPgPracticeRepository(new FakeQueryClient([[], [createSessionRow({ status: 'completed' })]])).saveProgress({
      studentId: 'student-1',
      sessionId: 'session-1',
      currentSort: 2,
    })).rejects.toThrow(CompletedSessionError);

    await expect(createPgPracticeRepository(new FakeQueryClient([[], [createSessionRow({ status: 'completed' })]])).saveDraft({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      answer: ['A'],
    })).rejects.toThrow(CompletedSessionError);

    await expect(createPgPracticeRepository(new FakeQueryClient([[], [createSessionRow({ status: 'completed' })]])).clearDraft({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
    })).rejects.toThrow(CompletedSessionError);

    await expect(createPgPracticeRepository(new FakeQueryClient([[], [createSessionRow({ status: 'completed' })]])).setReviewFlag({
      studentId: 'student-1',
      sessionId: 'session-1',
      questionId: 'question-1',
      markedForReview: true,
    })).rejects.toThrow(CompletedSessionError);
  });

  it('lists active sessions for a student', async () => {
    const client = new FakeQueryClient([[createSessionRow({ id: 'session-2', current_sort: 4 })]]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.listActiveSessions({ studentId: 'student-1' });

    expect(client.calls[0].sql).toContain("practice_sessions.status = 'active'");
    expect(client.calls[0].sql).toContain('practice_sessions.student_id = $1');
    expect(client.calls[0].sql).toContain('current_sort');
    expect(client.calls[0].params).toEqual(['student-1']);
    expect(result).toEqual([
      {
        id: 'session-2',
        bankId: 'bank-1',
        mode: 'sequential',
        questionCount: 2,
        completedCount: 1,
        correctCount: 1,
        currentSort: 4,
        status: 'active',
      },
    ]);
  });

  it('lists paged active session cards with draft/review progress and stable ordering', async () => {
    const client = new FakeQueryClient([[
      {
        ...createSessionRow({ id: 'session-2', question_count: 4, completed_count: 1, correct_count: 1, current_sort: 3 }),
        bank_name: '数据库测试题库',
        origin: 'bank',
        answered_count: 3,
        review_count: 1,
        created_at: new Date('2026-07-11T08:00:00.000Z'),
        updated_at: new Date('2026-07-11T08:03:00.000Z'),
        completed_at: null,
      },
      {
        ...createSessionRow({ id: 'session-1', question_count: 2, completed_count: 0, correct_count: 0, current_sort: 1 }),
        bank_name: '第二题库',
        origin: 'wrongbook',
        answered_count: 0,
        review_count: 0,
        created_at: new Date('2026-07-11T07:00:00.000Z'),
        updated_at: new Date('2026-07-11T07:01:00.000Z'),
        completed_at: null,
      },
    ]]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.listSessions({
      studentId: 'student-1',
      status: 'active',
      limit: 1,
      offset: 0,
    });

    expect(client.calls[0].sql).toContain('practice_sessions.status = $2');
    expect(client.calls[0].sql).toContain('practice_session_questions.answered_at IS NOT NULL');
    expect(client.calls[0].sql).toContain("practice_session_drafts.draft_answer <> '[]'");
    expect(client.calls[0].sql).toContain("practice_session_drafts.draft_answer !~ '^\"[[:space:]]*\"$'");
    expect(client.calls[0].sql).toContain('practice_session_drafts.marked_for_review = true');
    expect(client.calls[0].sql).toContain('ORDER BY practice_sessions.updated_at DESC');
    expect(client.calls[0].params).toEqual(['student-1', 'active', 2, 0]);
    expect(result).toEqual({
      sessions: [{
        id: 'session-2',
        bankId: 'bank-1',
        bankName: '数据库测试题库',
        origin: 'bank',
        mode: 'sequential',
        questionCount: 4,
        answeredCount: 3,
        correctCount: 1,
        reviewCount: 1,
        currentSort: 3,
        status: 'active',
        createdAt: '2026-07-11T08:00:00.000Z',
        updatedAt: '2026-07-11T08:03:00.000Z',
        completedAt: null,
      }],
      page: { limit: 1, offset: 0, hasMore: true },
    });
  });

  it('uses graded counts and completed-at ordering for completed session history', async () => {
    const client = new FakeQueryClient([[
      {
        ...createSessionRow({
          status: 'completed',
          question_count: 4,
          completed_count: 3,
          correct_count: 2,
        }),
        bank_name: null,
        origin: 'wrongbook',
        answered_count: 4,
        review_count: 1,
        created_at: '2026-07-11T08:00:00.000Z',
        updated_at: '2026-07-11T08:03:00.000Z',
        completed_at: '2026-07-11T08:04:00.000Z',
      },
    ]]);
    const repository = createPgPracticeRepository(client);

    const result = await repository.listSessions({
      studentId: 'student-1',
      status: 'completed',
      limit: 20,
      offset: 40,
    });

    expect(client.calls[0].sql).toContain('ORDER BY practice_sessions.completed_at DESC NULLS LAST');
    expect(client.calls[0].params).toEqual(['student-1', 'completed', 21, 40]);
    expect(result.sessions[0]).toMatchObject({
      bankName: 'bank-1',
      origin: 'wrongbook',
      answeredCount: 3,
      correctCount: 2,
      status: 'completed',
      completedAt: '2026-07-11T08:04:00.000Z',
    });
  });
});

describe('createMemoryPracticeRepository', () => {
  it('stores drafts, review flags, progress, and active sessions in memory', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 1,
      questionTypes: ['single_choice'],
    });
    created?.questions.push({
      id: 'question-1',
      sort: 1,
      type: 'single_choice',
      content: 'Question 1',
      options: [],
      answered: false,
      markedForReview: false,
    });
    created!.session.questionCount = 1;

    await expect(repository.clearDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
    })).resolves.toBe(false);
    await expect(repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      answer: ['A'],
    })).resolves.toMatchObject({ id: 'question-1', draftAnswer: ['A'], markedForReview: false });
    await expect(repository.setReviewFlag({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      markedForReview: true,
    })).resolves.toMatchObject({ id: 'question-1', draftAnswer: ['A'], markedForReview: true });
    await expect(repository.clearDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
    })).resolves.toBe(true);
    await expect(repository.saveProgress({
      studentId: 'student-1',
      sessionId: created!.session.id,
      currentSort: 1,
    })).resolves.toMatchObject({ id: created!.session.id, currentSort: 1 });
    await expect(repository.saveProgress({
      studentId: 'student-1',
      sessionId: created!.session.id,
      currentSort: 99,
    })).resolves.toBeNull();
    await expect(repository.listActiveSessions({ studentId: 'student-1' })).resolves.toEqual([created!.session]);
    await expect(repository.listSessions({
      studentId: 'student-1',
      status: 'active',
      limit: 20,
      offset: 0,
    })).resolves.toMatchObject({
      sessions: [{
        id: created!.session.id,
        bankName: 'bank-1',
        origin: 'bank',
        answeredCount: 0,
        reviewCount: 1,
        status: 'active',
        completedAt: null,
      }],
      page: { limit: 20, offset: 0, hasMore: false },
    });

    expect(created?.questions[0]?.draftAnswer).toBeUndefined();
    expect(created?.questions[0]?.markedForReview).toBe(true);
    expect(created?.session.currentSort).toBe(1);
  });

  it('preserves memory draft row state after clearing a false review flag', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 1,
      questionTypes: ['single_choice'],
    });
    created?.questions.push({
      id: 'question-1',
      sort: 1,
      type: 'single_choice',
      content: 'Question 1',
      options: [],
      answered: false,
      markedForReview: false,
    });

    const flagged = await repository.setReviewFlag({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      markedForReview: false,
    });

    expect(flagged).toMatchObject({ markedForReview: false });
    expect(flagged?.draftAnswer).toBeUndefined();
    await expect(repository.clearDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
    })).resolves.toBe(true);
    await expect(repository.clearDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
    })).resolves.toBe(false);
  });

  it('returns null or false for missing memory sessions', async () => {
    const repository = createMemoryPracticeRepository();

    await expect(repository.saveDraft({
      studentId: 'student-1',
      sessionId: 'missing-session',
      questionId: 'question-1',
      answer: ['A'],
    })).resolves.toBeNull();
    await expect(repository.setReviewFlag({
      studentId: 'student-1',
      sessionId: 'missing-session',
      questionId: 'question-1',
      markedForReview: true,
    })).resolves.toBeNull();
    await expect(repository.saveProgress({
      studentId: 'student-1',
      sessionId: 'missing-session',
      currentSort: 1,
    })).resolves.toBeNull();
    await expect(repository.clearDraft({
      studentId: 'student-1',
      sessionId: 'missing-session',
      questionId: 'question-1',
    })).resolves.toBe(false);
  });

  it('throws when mutating completed owned memory sessions', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 1,
      questionTypes: ['single_choice'],
    });
    created?.questions.push({
      id: 'question-1',
      sort: 1,
      type: 'single_choice',
      content: 'Question 1',
      options: [],
      answered: false,
      markedForReview: false,
    });
    created!.session.status = 'completed';

    await expect(repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      answer: ['A'],
    })).rejects.toThrow(CompletedSessionError);
    await expect(repository.setReviewFlag({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      markedForReview: true,
    })).rejects.toThrow(CompletedSessionError);
    await expect(repository.saveProgress({
      studentId: 'student-1',
      sessionId: created!.session.id,
      currentSort: 1,
    })).rejects.toThrow(CompletedSessionError);
    await expect(repository.clearDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
    })).rejects.toThrow(CompletedSessionError);
    await expect(repository.listActiveSessions({ studentId: 'student-1' })).resolves.toEqual([]);
  });

  it('throws when submitting a completed owned memory session', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 1,
      questionTypes: ['single_choice'],
    });
    created!.session.status = 'completed';

    await expect(repository.submitSession({ studentId: 'student-1', sessionId: created!.session.id })).rejects.toThrow(
      CompletedSessionError,
    );
  });

  it('submits drafted memory answers and completes the session', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'random',
      limit: 2,
      questionTypes: ['single_choice'],
    });
    const correctQuestion = {
        id: 'question-1',
        sort: 1,
        type: 'single_choice',
        content: 'Question 1',
        options: [{ id: 'A', sort: 1, content: 'A' }],
        answered: false,
        markedForReview: false,
        answerRaw: 'A',
      };
    const incorrectQuestion = {
        id: 'question-2',
        sort: 2,
        type: 'single_choice',
        content: 'Question 2',
        options: [{ id: 'A', sort: 1, content: 'A' }],
        answered: false,
        markedForReview: false,
        answerRaw: 'A',
      };
    created?.questions.push(correctQuestion, incorrectQuestion);
    created!.session.questionCount = 2;

    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      answer: ['A'],
    });
    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-2',
      answer: ['B'],
    });

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: created!.session.id });

    expect(result?.session).toMatchObject({
      id: created!.session.id,
      bankId: 'bank-1',
      mode: 'random',
      questionCount: 2,
      completedCount: 2,
      correctCount: 1,
      currentSort: 1,
      status: 'completed',
    });
    expect(result?.results.map((answer) => [answer.questionId, answer.isCorrect])).toEqual([
      ['question-1', true],
      ['question-2', false],
    ]);
    expect(created?.questions.map((question) => [question.answered, question.isCorrect])).toEqual([
      [true, true],
      [true, false],
    ]);
    await expect(repository.submitSession({ studentId: 'student-2', sessionId: created!.session.id })).resolves.toBeNull();
  });

  it('grades memory session drafts against the stored answer instead of the first option', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 1,
      questionTypes: ['single_choice'],
    });
    const question = {
      id: 'question-1',
      sort: 1,
      type: 'single_choice',
      content: 'Question 1',
      options: [
        { id: 'option-a', sort: 1, content: 'A' },
        { id: 'option-b', sort: 2, content: 'B' },
      ],
      answered: false,
      markedForReview: false,
      answerRaw: 'option-b',
    };
    created?.questions.push(question);
    created!.session.questionCount = 1;

    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      answer: ['option-b'],
    });

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: created!.session.id });

    expect(result?.session.correctCount).toBe(1);
    expect(result?.results).toEqual([
      { questionId: 'question-1', isCorrect: true, correctAnswer: ['option-b'], needsSelfReview: false },
    ]);
    expect(created?.questions[0]?.isCorrect).toBe(true);
  });

  it('does not treat the first memory option as correct when answerRaw is missing', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 1,
      questionTypes: ['single_choice'],
    });
    created?.questions.push({
      id: 'question-1',
      sort: 1,
      type: 'single_choice',
      content: 'Question 1',
      options: [
        { id: 'option-a', sort: 1, content: 'A' },
        { id: 'option-b', sort: 2, content: 'B' },
      ],
      answered: false,
      markedForReview: false,
    });
    created!.session.questionCount = 1;

    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      answer: ['option-a'],
    });

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: created!.session.id });

    expect(result?.session.correctCount).toBe(0);
    expect(result?.results).toEqual([
      { questionId: 'question-1', isCorrect: null, correctAnswer: [], needsSelfReview: true },
    ]);
    expect(created?.questions[0]?.isCorrect).toBeNull();
  });

  it('ignores empty memory drafts when submitting a session', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 3,
      questionTypes: ['single_choice'],
    });
    created?.questions.push(
      {
        id: 'question-1',
        sort: 1,
        type: 'single_choice',
        content: 'Question 1',
        options: [{ id: 'A', sort: 1, content: 'A' }],
        answered: false,
        markedForReview: false,
        answerRaw: 'A',
      },
      {
        id: 'question-2',
        sort: 2,
        type: 'single_choice',
        content: 'Question 2',
        options: [{ id: 'A', sort: 1, content: 'A' }],
        answered: false,
        markedForReview: false,
        answerRaw: 'A',
      },
      {
        id: 'question-3',
        sort: 3,
        type: 'single_choice',
        content: 'Question 3',
        options: [{ id: 'A', sort: 1, content: 'A' }],
        answered: false,
        markedForReview: false,
        answerRaw: 'A',
      },
    );
    created!.session.questionCount = 3;

    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-1',
      answer: ['A'],
    });
    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-2',
      answer: '   ',
    });
    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-3',
      answer: [],
    });

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: created!.session.id });

    expect(result?.session.completedCount).toBe(1);
    expect(result?.session.correctCount).toBe(1);
    expect(result?.results.map((answer) => answer.questionId)).toEqual(['question-1']);
    expect(created?.questions.map((question) => [question.answered, question.isCorrect])).toEqual([
      [true, true],
      [false, undefined],
      [false, undefined],
    ]);
  });

  it('includes existing answered memory questions when completing a session submission', async () => {
    const repository = createMemoryPracticeRepository();
    const created = await repository.createSession({
      studentId: 'student-1',
      bankId: 'bank-1',
      mode: 'sequential',
      limit: 2,
      questionTypes: ['single_choice'],
    });
    created?.questions.push(
      {
        id: 'question-1',
        sort: 1,
        type: 'single_choice',
        content: 'Question 1',
        options: [{ id: 'A', sort: 1, content: 'A' }],
        answered: true,
        markedForReview: false,
        isCorrect: true,
        draftAnswer: ['B'],
        answerRaw: 'A',
      },
      {
        id: 'question-2',
        sort: 2,
        type: 'single_choice',
        content: 'Question 2',
        options: [{ id: 'A', sort: 1, content: 'A' }],
        answered: false,
        markedForReview: false,
        answerRaw: 'A',
      },
    );
    created!.session.questionCount = 2;

    await repository.saveDraft({
      studentId: 'student-1',
      sessionId: created!.session.id,
      questionId: 'question-2',
      answer: ['B'],
    });

    const result = await repository.submitSession({ studentId: 'student-1', sessionId: created!.session.id });

    expect(result?.session.completedCount).toBe(2);
    expect(result?.session.correctCount).toBe(1);
    expect(result?.results.map((answer) => answer.questionId)).toEqual(['question-2']);
    expect(created?.questions.map((question) => [question.answered, question.isCorrect])).toEqual([
      [true, true],
      [true, false],
    ]);
  });
});
