import { describe, expect, it } from 'vitest';
import {
  createAdminStudentService,
  createMemoryAdminStudentRepository,
  createPgAdminStudentRepository,
} from '../../src/admin/adminStudents';
import type { QueryClient } from '../../src/db/client';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

const actor = {
  id: '50000000-0000-4000-8000-000000000001',
  displayName: 'Root Admin',
};

const studentId = '60000000-0000-4000-8000-000000000001';

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

describe('admin student service', () => {
  it('creates students with hashed passwords, class inference, and management-safe DTOs', async () => {
    const repository = createMemoryAdminStudentRepository();
    const service = createAdminStudentService(repository);
    const now = new Date('2026-07-15T10:00:00.000Z');

    const result = await service.createStudent({
      loginName: ' 202502040201 ',
      displayName: ' Student 201 ',
      initialPassword: 'temporary123',
      passwordResetRequired: true,
    }, actor, now);

    expect(result).toMatchObject({
      status: 'created',
      student: {
        loginName: '202502040201',
        displayName: 'Student 201',
        className: '2班',
        groupName: null,
        status: 'active',
        passwordResetRequired: true,
        createdBy: actor,
      },
    });
    expect(repository.students[0]?.passwordHash).not.toBe('temporary123');
    expect(JSON.stringify(result)).not.toContain('temporary123');
  });

  it('bulk creates with default password, skips existing accounts, and reports duplicates as partial failure', async () => {
    const repository = createMemoryAdminStudentRepository([{
      id: studentId,
      loginName: 'existing-student',
      displayName: 'Existing Student',
    }]);
    const service = createAdminStudentService(repository);

    const result = await service.bulkCreateStudents({
      students: [
        { loginName: '202502040230', displayName: 'Student 230' },
        { loginName: 'existing-student' },
        { loginName: '202502040230', displayName: 'Duplicate Student 230' },
      ],
      options: {
        defaultInitialPassword: 'temporary123',
        passwordResetRequired: true,
        revokeExistingSessions: true,
        skipExisting: true,
      },
    }, actor, new Date('2026-07-15T10:00:00.000Z'));

    expect(result).toMatchObject({
      created: [{
        loginName: '202502040230',
        className: '2班',
        passwordResetRequired: true,
      }],
      skipped: [{ loginName: 'existing-student', reason: 'loginName already exists' }],
      failed: [{ loginName: '202502040230', error: 'Duplicate loginName in request' }],
    });
  });

  it('updates profile fields and resets password state while revoking active sessions', async () => {
    const repository = createMemoryAdminStudentRepository([{
      id: studentId,
      loginName: 'student-1',
      displayName: 'Student One',
      className: '1班',
      status: 'active',
      passwordResetRequired: false,
      failedLoginCount: 3,
      lockedUntil: new Date('2026-07-15T11:00:00.000Z'),
      activeSessionCount: 2,
    }]);
    const service = createAdminStudentService(repository);

    await expect(service.updateStudent(studentId, {
      displayName: 'Student Uno',
      status: 'disabled',
      className: null,
      groupName: 'A组',
    }, new Date('2026-07-15T10:00:00.000Z'))).resolves.toMatchObject({
      status: 'updated',
      before: { displayName: 'Student One', className: '1班', status: 'active' },
      after: { displayName: 'Student Uno', className: null, groupName: 'A组', status: 'disabled' },
    });

    const reset = await service.resetStudentPassword(studentId, {
      newPassword: 'newtemporary123',
      revokeExistingSessions: true,
    }, new Date('2026-07-15T10:05:00.000Z'));

    expect(reset).toMatchObject({
      status: 'updated',
      student: {
        id: studentId,
        passwordResetRequired: true,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      revokedSessions: 2,
    });
    expect(repository.students[0]?.passwordHash).not.toBe('newtemporary123');
  });
});

describe('PostgreSQL admin student repository', () => {
  it('lists students with status, class, reset, locked, and keyword filters', async () => {
    const { client, queries } = createFakeQueryClient([{
      id: studentId,
      login_name: '202502040201',
      display_name: 'Student 201',
      class_name: '2班',
      group_name: null,
      status: 'active',
      password_reset_required: true,
      password_changed_at: null,
      failed_login_count: 0,
      locked_until: null,
      last_login_at: null,
      created_by_admin_id: actor.id,
      created_by_admin_display_name: actor.displayName,
      created_at: new Date('2026-07-15T10:00:00.000Z'),
      updated_at: new Date('2026-07-15T10:00:00.000Z'),
    }]);
    const repository = createPgAdminStudentRepository(client);

    const page = await repository.listStudents({
      status: 'active',
      className: '2班',
      passwordResetRequired: true,
      lockedOnly: true,
      keyword: '201',
      limit: 20,
      offset: 0,
    });

    expect(queries[0].sql).toContain('FROM students');
    expect(queries[0].sql).toContain('LEFT JOIN admin_users creator');
    expect(queries[0].sql).toContain('students.locked_until IS NOT NULL');
    expect(queries[0].sql).toContain('lower(students.login_name) LIKE $4');
    expect(queries[0].params).toEqual(['active', '2班', true, '%201%', 21, 0]);
    expect(page.students[0]).toMatchObject({
      id: studentId,
      loginName: '202502040201',
      className: '2班',
      createdBy: actor,
    });
  });

  it('inserts students without returning password hashes', async () => {
    const queries: RecordedQuery[] = [];
    const client: QueryClient = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (sql.includes('INSERT INTO students')) {
          return { rows: [{ id: studentId }] };
        }
        if (sql.includes('WHERE students.id = $1')) {
          return {
            rows: [{
              id: studentId,
              login_name: 'student-1',
              display_name: 'Student One',
              class_name: null,
              group_name: null,
              status: 'active',
              password_reset_required: true,
              password_changed_at: null,
              failed_login_count: 0,
              locked_until: null,
              last_login_at: null,
              created_by_admin_id: actor.id,
              created_by_admin_display_name: actor.displayName,
              created_at: new Date('2026-07-15T10:00:00.000Z'),
              updated_at: new Date('2026-07-15T10:00:00.000Z'),
            }],
          };
        }
        return { rows: [] };
      },
    };
    const repository = createPgAdminStudentRepository(client);

    await expect(repository.createStudent({
      loginName: 'student-1',
      displayName: 'Student One',
      passwordHash: 'hash',
      className: null,
      groupName: null,
      passwordResetRequired: true,
      passwordChangedAt: null,
      createdByAdminId: actor.id,
      now: new Date('2026-07-15T10:00:00.000Z'),
    })).resolves.toMatchObject({
      status: 'created',
      student: { loginName: 'student-1', passwordResetRequired: true },
    });

    expect(queries[0].sql).toContain('ON CONFLICT (login_name) DO NOTHING');
    expect(JSON.stringify(queries)).toContain('hash');
  });
});
