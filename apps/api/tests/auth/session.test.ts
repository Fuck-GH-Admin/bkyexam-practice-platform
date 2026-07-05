import { describe, expect, it } from 'vitest';
import {
  createPgStudentSessionRepository,
  createSessionService,
  hashSessionToken,
  type SessionStudent,
  type StudentSessionRepository,
} from '../../src/auth/session';
import type { QueryClient } from '../../src/db/client';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

function createFakeQueryClient(rows: unknown[] = []) {
  const queries: RecordedQuery[] = [];
  const client: QueryClient = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows };
    },
  };

  return { client, queries };
}

function fakeSessionRepository(student: SessionStudent | null): StudentSessionRepository {
  return {
    async createSession() {},
    async findStudentByTokenHash() {
      return student;
    },
    async revokeSession() {},
  };
}

describe('session service', () => {
  it('hashes raw session tokens without returning the raw token', () => {
    const token = 'raw-token';
    const hash = hashSessionToken(token);

    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
  });

  it('returns null for a missing token', async () => {
    const service = createSessionService(fakeSessionRepository({
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
    }), { ttlDays: 30 });

    await expect(service.resolveStudent(undefined)).resolves.toBeNull();
  });

  it('returns null for expired or revoked sessions', async () => {
    const service = createSessionService(fakeSessionRepository(null), { ttlDays: 30 });

    await expect(service.resolveStudent('raw-token')).resolves.toBeNull();
  });
});

describe('PostgreSQL student session repository', () => {
  it('inserts sessions into student_sessions', async () => {
    const { client, queries } = createFakeQueryClient();
    const repository = createPgStudentSessionRepository(client);
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');

    await repository.createSession({ studentId: 'student-1', tokenHash: 'hash-1', expiresAt });

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('INSERT INTO student_sessions');
    expect(queries[0].sql).toContain('student_id');
    expect(queries[0].sql).toContain('token_hash');
    expect(queries[0].sql).toContain('expires_at');
    expect(queries[0].params).toEqual(['student-1', 'hash-1', expiresAt]);
  });

  it('finds students only from active unexpired sessions', async () => {
    const now = new Date('2026-07-04T00:00:00.000Z');
    const { client, queries } = createFakeQueryClient([
      { id: 'student-1', login_name: 'alice', display_name: 'Alice' },
    ]);
    const repository = createPgStudentSessionRepository(client);

    await expect(repository.findStudentByTokenHash('hash-1', now)).resolves.toEqual({
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('JOIN students');
    expect(queries[0].sql).toContain('token_hash = $1');
    expect(queries[0].sql).toContain('revoked_at IS NULL');
    expect(queries[0].sql).toContain('expires_at > $2');
    expect(queries[0].params).toEqual(['hash-1', now]);
  });

  it('revokes active sessions by token hash', async () => {
    const now = new Date('2026-07-04T00:00:00.000Z');
    const { client, queries } = createFakeQueryClient();
    const repository = createPgStudentSessionRepository(client);

    await repository.revokeSession('hash-1', now);

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('UPDATE student_sessions');
    expect(queries[0].sql).toContain('revoked_at = $2');
    expect(queries[0].sql).toContain('token_hash = $1');
    expect(queries[0].sql).toContain('revoked_at IS NULL');
    expect(queries[0].params).toEqual(['hash-1', now]);
  });
});
