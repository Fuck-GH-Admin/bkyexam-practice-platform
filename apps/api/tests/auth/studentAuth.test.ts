import { describe, expect, it } from 'vitest';
import {
  createPgStudentAuthRepository,
  inferClassNameFromLoginName,
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
        className: student.className ?? null,
        groupName: student.groupName ?? null,
        status: 'active' as const,
        passwordResetRequired: student.passwordResetRequired ?? false,
        failedLoginCount: 0,
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
      student: {
        loginName: 'alice',
        displayName: 'alice',
        className: null,
        groupName: null,
      },
      passwordResetRequired: false,
    });
  });

  it('returns the same login name on repeated login', async () => {
    const repository = createMemoryRepository();
    const service = createStudentAuthService(repository);

    await service.login({ loginName: 'alice' });

    await expect(service.login({ loginName: 'alice' })).resolves.toEqual({
      student: {
        loginName: 'alice',
        displayName: 'alice',
        className: null,
        groupName: null,
      },
      passwordResetRequired: false,
    });
  });

  it('defaults display name to the normalized login name', async () => {
    const service = createStudentAuthService(createMemoryRepository());

    await expect(service.login({ loginName: '  alice  ' })).resolves.toEqual({
      student: {
        loginName: 'alice',
        displayName: 'alice',
        className: null,
        groupName: null,
      },
      passwordResetRequired: false,
    });
  });

  it('infers the known 2班 class range for first-login student identities', async () => {
    const repository = createMemoryRepository();
    const service = createStudentAuthService(repository);

    await expect(service.login({ loginName: '202502040201' })).resolves.toEqual({
      student: {
        loginName: '202502040201',
        displayName: '202502040201',
        className: '2班',
        groupName: null,
      },
      passwordResetRequired: false,
    });
    expect(inferClassNameFromLoginName('202502040230')).toBe('2班');
    expect(inferClassNameFromLoginName('202502040231')).toBeNull();
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

  it('rejects disabled or currently locked student accounts', async () => {
    const service = createStudentAuthService(
      createMemoryRepository([
        { loginName: 'disabled', displayName: 'Disabled', status: 'disabled' },
        {
          loginName: 'locked',
          displayName: 'Locked',
          status: 'active',
          lockedUntil: new Date('2026-07-15T12:00:00.000Z'),
        },
      ]),
    );

    await expect(service.login({ loginName: 'disabled' })).rejects.toThrow('Student account disabled');
    await expect(service.login({
      loginName: 'locked',
      now: new Date('2026-07-15T11:59:00.000Z'),
    })).rejects.toThrow('Student account locked');
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
        class_name: '2班',
        group_name: null,
        status: 'active',
        password_reset_required: true,
        password_changed_at: new Date('2026-07-15T10:00:00.000Z'),
        failed_login_count: 2,
        failed_login_window_started_at: new Date('2026-07-15T10:01:00.000Z'),
        locked_until: null,
        last_login_at: new Date('2026-07-15T10:02:00.000Z'),
        created_by_admin_id: 'admin-1',
      },
    ]);
    const repository = createPgStudentAuthRepository(client);

    await expect(repository.findByLoginName('alice')).resolves.toEqual({
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
      passwordHash: 'hash-1',
      className: '2班',
      groupName: null,
      status: 'active',
      passwordResetRequired: true,
      passwordChangedAt: new Date('2026-07-15T10:00:00.000Z'),
      failedLoginCount: 2,
      failedLoginWindowStartedAt: new Date('2026-07-15T10:01:00.000Z'),
      lockedUntil: null,
      lastLoginAt: new Date('2026-07-15T10:02:00.000Z'),
      createdByAdminId: 'admin-1',
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('class_name');
    expect(queries[0].sql).toContain('password_reset_required');
    expect(queries[0].sql).toContain('locked_until');
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
        class_name: '2班',
        group_name: null,
        status: 'active',
        password_reset_required: false,
        password_changed_at: null,
        failed_login_count: 0,
        failed_login_window_started_at: null,
        locked_until: null,
        last_login_at: null,
        created_by_admin_id: null,
      },
    ]);
    const repository = createPgStudentAuthRepository(client);

    await expect(repository.createStudent({ loginName: 'alice', displayName: 'Alice' })).resolves.toEqual({
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
      passwordHash: undefined,
      className: '2班',
      groupName: null,
      status: 'active',
      passwordResetRequired: false,
      passwordChangedAt: null,
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
      lastLoginAt: null,
      createdByAdminId: null,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('INSERT INTO students');
    expect(queries[0].sql).toContain('id,');
    expect(queries[0].sql).toContain('login_name');
    expect(queries[0].sql).toContain('display_name');
    expect(queries[0].sql).toContain('password_hash');
    expect(queries[0].sql).toContain('class_name');
    expect(queries[0].sql).toContain('password_reset_required');
    expect(queries[0].params).toHaveLength(7);
    expect(queries[0].params?.[0]).toEqual(expect.stringMatching(/[0-9a-f-]{36}/));
    expect(queries[0].params?.slice(1)).toEqual(['alice', 'Alice', null, null, null, false]);
  });
});
