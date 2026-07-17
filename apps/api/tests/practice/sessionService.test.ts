import { describe, expect, it } from 'vitest';
import type { QueryClient } from '../../src/db/client';
import { createPgPracticeSessionService } from '../../src/modules/practice/sessionService';

class FakeQueryClient implements QueryClient {
  calls: { sql: string; params?: readonly unknown[] }[] = [];

  constructor(private readonly results: unknown[] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.calls.push({ sql, params });
    return this.results.shift() ?? { rows: [] };
  }
}

describe('createPgPracticeSessionService', () => {
  it('creates a practice session from explicit question ids inside the Practice boundary', async () => {
    const client = new FakeQueryClient([
      { rows: [] },
      { rows: [{ id: 'session-1' }] },
      { rows: [] },
      { rows: [] },
    ]);
    const service = createPgPracticeSessionService(client);

    const result = await service.createSessionFromQuestionIds({
      studentId: 'student-1',
      bankId: 'bank-1',
      questionIds: ['question-1', 'question-2'],
      mode: 'sequential',
      origin: 'wrongbook',
    });

    expect(client.calls.map((call) => call.sql.trim().split(/\s+/)[0])).toEqual([
      'BEGIN',
      'INSERT',
      'INSERT',
      'COMMIT',
    ]);
    expect(client.calls[1].sql).toContain('INSERT INTO practice_sessions');
    expect(client.calls[1].sql).toContain('origin');
    expect(client.calls[1].params).toEqual([
      expect.any(String),
      'student-1',
      'bank-1',
      'sequential',
      2,
      'wrongbook',
    ]);
    expect(client.calls[2].sql).toContain('INSERT INTO practice_session_questions');
    expect(client.calls[2].params).toEqual(['session-1', 'question-1', 'question-2']);
    expect(result).toEqual({ sessionId: 'session-1', questionCount: 2 });
  });

  it('returns null without writing when question ids are empty', async () => {
    const client = new FakeQueryClient();
    const service = createPgPracticeSessionService(client);

    const result = await service.createSessionFromQuestionIds({
      studentId: 'student-1',
      bankId: 'bank-1',
      questionIds: [],
      mode: 'sequential',
      origin: 'wrongbook',
    });

    expect(result).toBeNull();
    expect(client.calls).toEqual([]);
  });
});
