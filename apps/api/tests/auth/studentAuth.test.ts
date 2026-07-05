import { describe, expect, it } from 'vitest';
import {
  createPgStudentAuthRepository,
  createStudentAuthService,
  type StudentAuthRepository,
  type StudentAuthRecord,
} from '../../src/auth/studentAuth';
import { hashPassword } from '../../src/auth/password';
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

function createMemoryRepository(initialStudents: StudentAuthRecord[] = []): StudentAuthRepository {
  const students = new Map(initialStudents.map((student) => [student.loginName, student]));

  return {
    async findByLoginName(loginName) {
      return students.get(loginName) ?? null;
    },
    async createStudent(student) {
      const created = {
        loginName: student.loginName,
        displayName: student.displayName,
        passwordHash: student.passwordHash,
      };
      students.set(created.loginName, created);
      return created;
    },
  };
}

describe('student auth service', () => {
  it('creates a student on first login', async () => {
    const service = createStudentAuthService(createMemoryRepository());

    await expect(service.login({ loginName: 'alice' })).resolves.toEqual({
      loginName: 'alice',
      displayName: 'alice',
    });
  });

  it('returns the same login name on repeated login', async () => {
    const repository = createMemoryRepository();
    const service = createStudentAuthService(repository);

    await service.login({ loginName: 'alice' });

    await expect(service.login({ loginName: 'alice' })).resolves.toEqual({
      loginName: 'alice',
      displayName: 'alice',
    });
  });

  it('defaults display name to the normalized login name', async () => {
    const service = createStudentAuthService(createMemoryRepository());

    await expect(service.login({ loginName: '  alice  ' })).resolves.toEqual({
      loginName: 'alice',
      displayName: 'alice',
    });
  });

  it('rejects an empty login name', async () => {
    const service = createStudentAuthService(createMemoryRepository());

    await expect(service.login({ loginName: '   ' })).rejects.toThrow('loginName is required');
  });

  it('rejects a wrong password for a password-protected student', async () => {
    const passwordHash = await hashPassword('secret');
    const service = createStudentAuthService(
      createMemoryRepository([{ loginName: 'alice', displayName: 'alice', passwordHash }]),
    );

    await expect(service.login({ loginName: 'alice', password: 'wrong' })).rejects.toThrow(
      'Invalid login credentials',
    );
  });
});

describe('PostgreSQL student auth repository', () => {
  it('finds students by login name and maps database columns', async () => {
    const { client, queries } = createFakeQueryClient([
      {
        id: 'student-1',
        login_name: 'alice',
        display_name: 'Alice',
        password_hash: 'hash-1',
      },
    ]);
    const repository = createPgStudentAuthRepository(client);

    await expect(repository.findByLoginName('alice')).resolves.toEqual({
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
      passwordHash: 'hash-1',
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('SELECT id, login_name, display_name, password_hash');
    expect(queries[0].sql).toContain('FROM students');
    expect(queries[0].sql).toContain('WHERE login_name = $1');
    expect(queries[0].sql).toContain('LIMIT 1');
    expect(queries[0].params).toEqual(['alice']);
  });

  it('inserts students and returns the created student id', async () => {
    const { client, queries } = createFakeQueryClient([
      {
        id: 'student-1',
        login_name: 'alice',
        display_name: 'Alice',
        password_hash: null,
      },
    ]);
    const repository = createPgStudentAuthRepository(client);

    await expect(repository.createStudent({ loginName: 'alice', displayName: 'Alice' })).resolves.toEqual({
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
      passwordHash: undefined,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('INSERT INTO students');
    expect(queries[0].sql).toContain('id, login_name, display_name, password_hash');
    expect(queries[0].sql).toContain('login_name');
    expect(queries[0].sql).toContain('display_name');
    expect(queries[0].sql).toContain('password_hash');
    expect(queries[0].sql).toContain('RETURNING id, login_name, display_name, password_hash');
    expect(queries[0].params).toHaveLength(4);
    expect(queries[0].params?.[0]).toEqual(expect.stringMatching(/[0-9a-f-]{36}/));
    expect(queries[0].params?.slice(1)).toEqual(['alice', 'Alice', null]);
  });
});
