import { describe, expect, it } from 'vitest';
import type { QueryClient } from '../../src/db/client';
import { createPgWrongQuestionRepository } from '../../src/wrongQuestions/repository';

class FakeQueryClient implements QueryClient {
  calls: { sql: string; params?: readonly unknown[] }[] = [];

  constructor(private readonly results: unknown[] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.calls.push({ sql, params });
    return this.results.shift() ?? { rows: [] };
  }
}

const wrongQuestionRow = {
  id: 'wrong-1',
  question_id: 'question-1',
  bank_id: 'bank-1',
  wrong_count: '2',
  last_answer: 'A',
  mastered: false,
  last_wrong_at: new Date('2026-01-02T03:04:05.000Z'),
};

describe('createPgWrongQuestionRepository', () => {
  it('lists current student unmastered wrong questions and maps rows', async () => {
    const client = new FakeQueryClient([{ rows: [wrongQuestionRow] }]);
    const repository = createPgWrongQuestionRepository(client);

    const result = await repository.list({ studentId: 'student-1', includeMastered: false });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].sql).toContain('FROM wrong_questions');
    expect(client.calls[0].sql).toContain('student_id = $1');
    expect(client.calls[0].sql).toContain('mastered = false');
    expect(client.calls[0].params).toEqual(['student-1']);
    expect(result).toEqual([
      {
        id: 'wrong-1',
        questionId: 'question-1',
        bankId: 'bank-1',
        wrongCount: 2,
        lastAnswer: 'A',
        mastered: false,
        lastWrongAt: '2026-01-02T03:04:05.000Z',
      },
    ]);
  });

  it('adds a bankId filter with a parameter when listing', async () => {
    const client = new FakeQueryClient([{ rows: [] }]);
    const repository = createPgWrongQuestionRepository(client);

    await repository.list({ studentId: 'student-1', bankId: 'bank-2', includeMastered: false });

    expect(client.calls[0].sql).toContain('student_id = $1');
    expect(client.calls[0].sql).toContain('bank_id = $2');
    expect(client.calls[0].sql).toContain('mastered = false');
    expect(client.calls[0].params).toEqual(['student-1', 'bank-2']);
  });

  it('does not add the mastered filter when includeMastered is true', async () => {
    const client = new FakeQueryClient([{ rows: [] }]);
    const repository = createPgWrongQuestionRepository(client);

    await repository.list({ studentId: 'student-1', includeMastered: true });

    expect(client.calls[0].sql).toContain('student_id = $1');
    expect(client.calls[0].sql).not.toContain('mastered = false');
    expect(client.calls[0].params).toEqual(['student-1']);
  });

  it('marks a current student wrong question mastered and returns true when a row is updated', async () => {
    const client = new FakeQueryClient([{ rows: [], rowCount: 1 }]);
    const repository = createPgWrongQuestionRepository(client);

    const result = await repository.markMastered({ studentId: 'student-1', id: 'wrong-1' });

    expect(result).toBe(true);
    expect(client.calls[0].sql).toContain('UPDATE wrong_questions');
    expect(client.calls[0].sql).toContain('SET mastered = true');
    expect(client.calls[0].sql).toContain('mastered_at = now()');
    expect(client.calls[0].sql).toContain('WHERE id = $1');
    expect(client.calls[0].sql).toContain('AND student_id = $2');
    expect(client.calls[0].params).toEqual(['wrong-1', 'student-1']);
  });

  it('returns false when markMastered updates no rows', async () => {
    const client = new FakeQueryClient([{ rows: [], rowCount: 0 }]);
    const repository = createPgWrongQuestionRepository(client);

    await expect(repository.markMastered({ studentId: 'student-1', id: 'wrong-2' })).resolves.toBe(false);
  });
});
