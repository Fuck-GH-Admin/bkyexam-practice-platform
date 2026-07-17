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

function createMemoryRepository(initialStudents: StudentAuthRecord[] = []): StudentAuthRepository & {
  get(loginName: string): StudentAuthRecord | undefined;
} {
  const students = new Map<string, StudentAuthRecord>();
  for (const student of initialStudents) {
    students.set(student.loginName, {
      id: student.id ?? student.loginName,
      className: null,
      groupName: null,
      status: 'active',
      passwordResetRequired: false,
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
      lastLoginAt: null,
      ...student,
    });
  }

  return {
    get(loginName) {
      return students.get(loginName);
    },
    async findByLoginName(loginName) {
      return students.get(loginName) ?? null;
    },
    async findById(studentId) {
      return [...students.values()].find((student) => student.id === studentId) ?? null;
    },
    async createStudent(student) {
      const created: StudentAuthRecord = {
        id: student.loginName,
        loginName: student.loginName,
        displayName: student.displayName,
        passwordHash: student.passwordHash,
        className: student.className ?? null,
        groupName: student.groupName ?? null,
        status: 'active',
        passwordResetRequired: student.passwordResetRequired ?? false,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: null,
      };
      students.set(created.loginName, created);
      return created;
    },
    async recordLoginFailure(input) {
      const student = students.get(input.loginName);
      if (!student) return;
      students.set(input.loginName, {
        ...student,
        failedLoginCount: input.failedLoginCount,
        failedLoginWindowStartedAt: input.failedLoginWindowStartedAt,
        lockedUntil: input.lockedUntil,
      });
    },
    async recordLoginSuccess(input) {
      const student = students.get(input.loginName);
      if (!student) return;
      students.set(input.loginName, {
        ...student,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
        lastLoginAt: input.now,
      });
    },
    async updateStudentPassword(input) {
      const student = [...students.values()].find((candidate) => candidate.id === input.studentId);
      if (!student) return null;
      const updated: StudentAuthRecord = {
        ...student,
        passwordHash: input.passwordHash,
        passwordResetRequired: false,
        passwordChangedAt: input.passwordChangedAt,
        failedLoginCount: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
      };
      students.set(updated.loginName, updated);
      return updated;
    },
  };
}

describe('student auth service', () => {
  it('rejects unknown students by default instead of public self-registration', async () => {
    const service = createStudentAuthService(createMemoryRepository());

    await expect(service.login({ loginName: 'alice', password: 'secret123' })).rejects.toThrow(
      'Invalid login credentials',
    );
  });

  it('requires a password by default for managed students', async () => {
    const passwordHash = await hashPassword('secret123');
    const service = createStudentAuthService(
      createMemoryRepository([{ loginName: 'alice', displayName: 'Alice', passwordHash }]),
    );

    await expect(service.login({ loginName: 'alice' })).rejects.toThrow('Student password is required');
  });

  it('allows legacy passwordless auto-create only when explicitly enabled', async () => {
    const service = createStudentAuthService(createMemoryRepository(), {
      legacyPasswordlessLoginEnabled: true,
    });

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

  it('allows legacy passwordless existing students only when explicitly enabled', async () => {
    const service = createStudentAuthService(
      createMemoryRepository([{ loginName: 'legacy', displayName: 'Legacy Student' }]),
      { legacyPasswordlessLoginEnabled: true },
    );

    await expect(service.login({ loginName: 'legacy' })).resolves.toMatchObject({
      student: { loginName: 'legacy', displayName: 'Legacy Student' },
      passwordResetRequired: false,
    });
  });

  it('infers the known 2班 class range for legacy-created student identities', async () => {
    const repository = createMemoryRepository();
    const service = createStudentAuthService(repository, { legacyPasswordlessLoginEnabled: true });

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

    await expect(service.login({ loginName: '   ', password: 'secret123' })).rejects.toThrow('loginName is required');
  });

  it('logs in a password student and preserves reset-required state', async () => {
    const passwordHash = await hashPassword('secret123');
    const service = createStudentAuthService(
      createMemoryRepository([{
        loginName: 'alice',
        displayName: 'Alice',
        passwordHash,
        className: '2班',
        groupName: 'A组',
        passwordResetRequired: true,
      }]),
    );

    await expect(service.login({ loginName: 'alice', password: 'secret123' })).resolves.toEqual({
      student: {
        loginName: 'alice',
        displayName: 'Alice',
        className: '2班',
        groupName: 'A组',
      },
      passwordResetRequired: true,
    });
  });

  it('records login failures and locks after the relaxed threshold', async () => {
    const passwordHash = await hashPassword('secret123');
    const repository = createMemoryRepository([{ loginName: 'alice', displayName: 'Alice', passwordHash }]);
    const service = createStudentAuthService(repository, {
      maxFailedLoginCount: 2,
      failureWindowMinutes: 30,
      lockMinutes: 15,
    });
    const firstAttemptAt = new Date('2026-07-15T10:00:00.000Z');
    const secondAttemptAt = new Date('2026-07-15T10:05:00.000Z');

    await expect(service.login({ loginName: 'alice', password: 'wrong', now: firstAttemptAt })).rejects.toThrow(
      'Invalid login credentials',
    );
    expect(repository.get('alice')).toMatchObject({
      failedLoginCount: 1,
      failedLoginWindowStartedAt: firstAttemptAt,
      lockedUntil: null,
    });

    await expect(service.login({ loginName: 'alice', password: 'wrong', now: secondAttemptAt })).rejects.toThrow(
      'Invalid login credentials',
    );
    expect(repository.get('alice')).toMatchObject({
      failedLoginCount: 2,
      failedLoginWindowStartedAt: firstAttemptAt,
      lockedUntil: new Date('2026-07-15T10:20:00.000Z'),
    });

    await expect(service.login({
      loginName: 'alice',
      password: 'secret123',
      now: new Date('2026-07-15T10:06:00.000Z'),
    })).rejects.toThrow('Student account locked');
  });

  it('clears login failure state on successful login', async () => {
    const passwordHash = await hashPassword('secret123');
    const repository = createMemoryRepository([{
      loginName: 'alice',
      displayName: 'Alice',
      passwordHash,
      failedLoginCount: 3,
      failedLoginWindowStartedAt: new Date('2026-07-15T09:30:00.000Z'),
      lockedUntil: new Date('2026-07-15T09:45:00.000Z'),
    }]);
    const service = createStudentAuthService(repository);
    const now = new Date('2026-07-15T10:00:00.000Z');

    await expect(service.login({ loginName: 'alice', password: 'secret123', now })).resolves.toMatchObject({
      student: { loginName: 'alice' },
    });
    expect(repository.get('alice')).toMatchObject({
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
      lastLoginAt: now,
    });
  });

  it('changes a student password and clears reset-required state', async () => {
    const passwordHash = await hashPassword('temporary123');
    const repository = createMemoryRepository([{
      id: 'student-1',
      loginName: 'alice',
      displayName: 'Alice',
      passwordHash,
      passwordResetRequired: true,
      failedLoginCount: 2,
      failedLoginWindowStartedAt: new Date('2026-07-15T09:30:00.000Z'),
    }]);
    const service = createStudentAuthService(repository);
    const now = new Date('2026-07-15T10:00:00.000Z');

    await expect(service.changePassword({
      studentId: 'student-1',
      currentPassword: 'temporary123',
      newPassword: 'newsecret123',
      now,
    })).resolves.toMatchObject({
      student: { loginName: 'alice' },
      passwordResetRequired: false,
    });

    expect(repository.get('alice')).toMatchObject({
      passwordResetRequired: false,
      passwordChangedAt: now,
      failedLoginCount: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
    });
    await expect(service.login({ loginName: 'alice', password: 'temporary123' })).rejects.toThrow(
      'Invalid login credentials',
    );
    await expect(service.login({ loginName: 'alice', password: 'newsecret123' })).resolves.toMatchObject({
      passwordResetRequired: false,
    });
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

    await expect(service.login({ loginName: 'disabled', password: 'secret123' })).rejects.toThrow(
      'Student account disabled',
    );
    await expect(service.login({
      loginName: 'locked',
      password: 'secret123',
      now: new Date('2026-07-15T11:59:00.000Z'),
    })).rejects.toThrow('Student account locked');
  });
});

describe('PostgreSQL student auth repository', () => {
  const row = {
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
  };

  it('finds students by login name and maps database columns', async () => {
    const { client, queries } = createFakeQueryClient([row]);
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

  it('finds students by id', async () => {
    const { client, queries } = createFakeQueryClient([row]);
    const repository = createPgStudentAuthRepository(client);

    await expect(repository.findById('student-1')).resolves.toMatchObject({ id: 'student-1', loginName: 'alice' });
    expect(queries[0].sql).toContain('WHERE id = $1');
    expect(queries[0].params).toEqual(['student-1']);
  });

  it('inserts students and returns the created student id', async () => {
    const { client, queries } = createFakeQueryClient([{
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
    }]);
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

  it('records login failure and success state', async () => {
    const { client, queries } = createFakeQueryClient();
    const repository = createPgStudentAuthRepository(client);
    const now = new Date('2026-07-15T10:00:00.000Z');
    const lockedUntil = new Date('2026-07-15T10:15:00.000Z');

    await repository.recordLoginFailure({
      loginName: 'alice',
      failedLoginCount: 10,
      failedLoginWindowStartedAt: now,
      lockedUntil,
      now,
    });
    await repository.recordLoginSuccess({ loginName: 'alice', now });

    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain('failed_login_count = $2');
    expect(queries[0].sql).toContain('locked_until = $4');
    expect(queries[0].params).toEqual(['alice', 10, now, lockedUntil, now]);
    expect(queries[1].sql).toContain('failed_login_count = 0');
    expect(queries[1].sql).toContain('last_login_at = $2');
    expect(queries[1].params).toEqual(['alice', now]);
  });

  it('updates student password and clears reset/failure state', async () => {
    const { client, queries } = createFakeQueryClient([row]);
    const repository = createPgStudentAuthRepository(client);
    const now = new Date('2026-07-15T10:00:00.000Z');

    await expect(repository.updateStudentPassword({
      studentId: 'student-1',
      passwordHash: 'new-hash',
      passwordChangedAt: now,
    })).resolves.toMatchObject({ id: 'student-1', loginName: 'alice' });

    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toContain('password_reset_required = false');
    expect(queries[0].sql).toContain('failed_login_count = 0');
    expect(queries[0].params).toEqual(['student-1', 'new-hash', now]);
    expect(queries[1].sql).toContain('WHERE id = $1');
  });
});
