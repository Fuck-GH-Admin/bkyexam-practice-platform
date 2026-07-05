import { describe, expect, it } from 'vitest';
import type { QueryClient } from '../../src/db/client';
import { CompletedSessionError, createPgPracticeRepository } from '../../src/practice/repository';

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
        },
        { id: 'question-2', sort: 2, type: 'yes_no', content: 'Question 2', options: [], answered: false },
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
      answer: ['B'],
    });

    const wrongQuestionUpsert = client.calls.find((call) => call.sql.includes('INSERT INTO wrong_questions'));

    expect(wrongQuestionUpsert?.sql).toContain('ON CONFLICT (student_id, question_id, bank_id) DO UPDATE');
    expect(wrongQuestionUpsert?.sql).toContain('wrong_count = wrong_questions.wrong_count + 1');
    expect(wrongQuestionUpsert?.params).toEqual([
      expect.any(String),
      'student-1',
      'question-1',
      'bank-1',
      '["B"]',
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
});
