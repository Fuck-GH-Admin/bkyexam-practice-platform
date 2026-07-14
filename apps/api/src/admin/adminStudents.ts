import { randomUUID } from 'node:crypto';
import type {
  AdminStudentListResponseV1,
  AdminStudentStatusV1,
  AdminStudentV1,
  BulkCreateAdminStudentsRequestV1,
  BulkCreateAdminStudentsResponseV1,
  CreateAdminStudentRequestV1,
  ListAdminStudentsRequestV1,
  ResetAdminStudentPasswordRequestV1,
  ResetAdminStudentPasswordResponseV1,
  RevokeAdminStudentSessionsResponseV1,
  UpdateAdminStudentRequestV1,
} from '@bkyexam-practice/shared';
import { hashPassword } from '../auth/password.js';
import { inferClassNameFromLoginName } from '../auth/studentAuth.js';
import type { QueryClient } from '../db/client.js';

export type CreateAdminStudentResult =
  | { status: 'created'; student: AdminStudentV1 }
  | { status: 'login_name_conflict' };

export type UpdateAdminStudentResult =
  | { status: 'updated'; before: AdminStudentV1; after: AdminStudentV1 }
  | { status: 'not_found' };

export type ResetAdminStudentPasswordResult =
  | ({ status: 'updated' } & ResetAdminStudentPasswordResponseV1)
  | { status: 'not_found' };

export type RevokeAdminStudentSessionsResult =
  | ({ status: 'revoked'; student: AdminStudentV1 } & RevokeAdminStudentSessionsResponseV1)
  | { status: 'not_found' };

export interface AdminStudentCreateInput {
  loginName: string;
  displayName: string;
  passwordHash: string;
  className: string | null;
  groupName: string | null;
  passwordResetRequired: boolean;
  passwordChangedAt: Date | null;
  createdByAdminId: string;
  createdByAdminDisplayName?: string;
  now: Date;
}

export interface AdminStudentUpdateInput {
  studentId: string;
  changes: {
    displayName?: string;
    status?: AdminStudentStatusV1;
    className?: string | null;
    groupName?: string | null;
  };
  now: Date;
}

export interface AdminStudentResetPasswordInput {
  studentId: string;
  passwordHash: string;
  revokeExistingSessions: boolean;
  now: Date;
}

export interface AdminStudentRepository {
  listStudents(filters: ListAdminStudentsRequestV1): Promise<AdminStudentListResponseV1>;
  findStudentById(studentId: string): Promise<AdminStudentV1 | null>;
  createStudent(input: AdminStudentCreateInput): Promise<CreateAdminStudentResult>;
  updateStudent(input: AdminStudentUpdateInput): Promise<UpdateAdminStudentResult>;
  resetStudentPassword(input: AdminStudentResetPasswordInput): Promise<ResetAdminStudentPasswordResult>;
  revokeStudentSessions(studentId: string, now: Date): Promise<RevokeAdminStudentSessionsResult>;
}

interface MemoryAdminStudentRecord {
  id: string;
  loginName: string;
  displayName: string;
  passwordHash: string;
  className: string | null;
  groupName: string | null;
  status: AdminStudentStatusV1;
  passwordResetRequired: boolean;
  passwordChangedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdByAdminId: string | null;
  createdByAdminDisplayName: string | null;
  createdAt: Date;
  updatedAt: Date;
  activeSessionCount: number;
}

interface QueryRows<T> {
  rows: T[];
}

interface AdminStudentRow {
  id: string;
  login_name: string;
  display_name: string;
  class_name: string | null;
  group_name: string | null;
  status: string;
  password_reset_required: boolean;
  password_changed_at: Date | string | null;
  failed_login_count: number | string;
  locked_until: Date | string | null;
  last_login_at: Date | string | null;
  created_by_admin_id: string | null;
  created_by_admin_display_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

type TransactionClient = QueryClient & { release?: () => void };

interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}

export function createAdminStudentService(repository: AdminStudentRepository) {
  return {
    listStudents(filters: ListAdminStudentsRequestV1) {
      return repository.listStudents(filters);
    },

    findStudentById(studentId: string) {
      return repository.findStudentById(studentId);
    },

    async createStudent(
      request: CreateAdminStudentRequestV1,
      actor: { id: string; displayName: string },
      now = new Date(),
    ) {
      const loginName = request.loginName.trim();
      const passwordResetRequired = request.passwordResetRequired;

      return repository.createStudent({
        loginName,
        displayName: normalizeDisplayName(request.displayName, loginName),
        passwordHash: await hashPassword(request.initialPassword),
        className: normalizeCreateClassName(request.className, loginName),
        groupName: normalizeNullableText(request.groupName),
        passwordResetRequired,
        passwordChangedAt: passwordResetRequired ? null : now,
        createdByAdminId: actor.id,
        createdByAdminDisplayName: actor.displayName,
        now,
      });
    },

    async bulkCreateStudents(
      request: BulkCreateAdminStudentsRequestV1,
      actor: { id: string; displayName: string },
      now = new Date(),
    ): Promise<BulkCreateAdminStudentsResponseV1> {
      const created: AdminStudentV1[] = [];
      const skipped: BulkCreateAdminStudentsResponseV1['skipped'] = [];
      const failed: BulkCreateAdminStudentsResponseV1['failed'] = [];
      const seenLoginNames = new Set<string>();

      for (const item of request.students) {
        const loginName = item.loginName.trim();
        if (seenLoginNames.has(loginName)) {
          failed.push({ loginName, error: 'Duplicate loginName in request' });
          continue;
        }
        seenLoginNames.add(loginName);

        const initialPassword = item.initialPassword ?? request.options.defaultInitialPassword;
        if (!initialPassword) {
          failed.push({ loginName, error: 'initialPassword is required' });
          continue;
        }

        const result = await repository.createStudent({
          loginName,
          displayName: normalizeDisplayName(item.displayName, loginName),
          passwordHash: await hashPassword(initialPassword),
          className: normalizeCreateClassName(item.className, loginName),
          groupName: normalizeNullableText(item.groupName),
          passwordResetRequired: request.options.passwordResetRequired,
          passwordChangedAt: request.options.passwordResetRequired ? null : now,
          createdByAdminId: actor.id,
          createdByAdminDisplayName: actor.displayName,
          now,
        });

        if (result.status === 'created') {
          created.push(result.student);
        } else if (request.options.skipExisting) {
          skipped.push({ loginName, reason: 'loginName already exists' });
        } else {
          failed.push({ loginName, error: 'loginName already exists' });
        }
      }

      return { created, skipped, failed };
    },

    async updateStudent(studentId: string, request: UpdateAdminStudentRequestV1, now = new Date()) {
      return repository.updateStudent({
        studentId,
        changes: {
          displayName: request.displayName?.trim(),
          status: request.status,
          className: request.className === undefined ? undefined : normalizeNullableText(request.className),
          groupName: request.groupName === undefined ? undefined : normalizeNullableText(request.groupName),
        },
        now,
      });
    },

    async resetStudentPassword(studentId: string, request: ResetAdminStudentPasswordRequestV1, now = new Date()) {
      return repository.resetStudentPassword({
        studentId,
        passwordHash: await hashPassword(request.newPassword),
        revokeExistingSessions: request.revokeExistingSessions,
        now,
      });
    },

    revokeStudentSessions(studentId: string, now = new Date()) {
      return repository.revokeStudentSessions(studentId, now);
    },
  };
}

export function createMemoryAdminStudentRepository(
  initialStudents: readonly (Partial<MemoryAdminStudentRecord> & {
    id: string;
    loginName: string;
    displayName: string;
    passwordHash?: string;
  })[] = [],
): AdminStudentRepository & { students: MemoryAdminStudentRecord[] } {
  const students: MemoryAdminStudentRecord[] = initialStudents.map((student) => ({
    passwordHash: 'hash',
    className: null,
    groupName: null,
    status: 'active',
    passwordResetRequired: false,
    passwordChangedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdByAdminId: null,
    createdByAdminDisplayName: null,
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    activeSessionCount: 0,
    ...student,
  }));

  return {
    students,

    async listStudents(filters) {
      const filtered = students
        .filter((student) => matchesMemoryFilters(student, filters))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      const pageItems = filtered.slice(filters.offset, filters.offset + filters.limit + 1);

      return {
        students: pageItems.slice(0, filters.limit).map(mapMemoryStudent),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: pageItems.length > filters.limit,
        },
      };
    },

    async findStudentById(studentId) {
      const student = students.find((candidate) => candidate.id === studentId);
      return student ? mapMemoryStudent(student) : null;
    },

    async createStudent(input) {
      if (students.some((student) => student.loginName === input.loginName)) {
        return { status: 'login_name_conflict' };
      }

      const created: MemoryAdminStudentRecord = {
        id: randomUUID(),
        loginName: input.loginName,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        className: input.className,
        groupName: input.groupName,
        status: 'active',
        passwordResetRequired: input.passwordResetRequired,
        passwordChangedAt: input.passwordChangedAt,
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdByAdminId: input.createdByAdminId,
        createdByAdminDisplayName: input.createdByAdminDisplayName ?? 'Admin',
        createdAt: input.now,
        updatedAt: input.now,
        activeSessionCount: 0,
      };
      students.push(created);

      return { status: 'created', student: mapMemoryStudent(created) };
    },

    async updateStudent(input) {
      const index = students.findIndex((student) => student.id === input.studentId);
      if (index < 0) return { status: 'not_found' };

      const before = mapMemoryStudent(students[index]);
      students[index] = {
        ...students[index],
        displayName: input.changes.displayName ?? students[index].displayName,
        status: input.changes.status ?? students[index].status,
        className: input.changes.className === undefined ? students[index].className : input.changes.className,
        groupName: input.changes.groupName === undefined ? students[index].groupName : input.changes.groupName,
        updatedAt: input.now,
      };

      return { status: 'updated', before, after: mapMemoryStudent(students[index]) };
    },

    async resetStudentPassword(input) {
      const index = students.findIndex((student) => student.id === input.studentId);
      if (index < 0) return { status: 'not_found' };

      const revokedSessions = input.revokeExistingSessions ? students[index].activeSessionCount : 0;
      students[index] = {
        ...students[index],
        passwordHash: input.passwordHash,
        passwordResetRequired: true,
        passwordChangedAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
        activeSessionCount: input.revokeExistingSessions ? 0 : students[index].activeSessionCount,
        updatedAt: input.now,
      };

      return {
        status: 'updated',
        student: mapMemoryStudent(students[index]),
        revokedSessions,
      };
    },

    async revokeStudentSessions(studentId, now) {
      const index = students.findIndex((student) => student.id === studentId);
      if (index < 0) return { status: 'not_found' };

      const revokedSessions = students[index].activeSessionCount;
      students[index] = {
        ...students[index],
        activeSessionCount: 0,
        updatedAt: now,
      };

      return {
        status: 'revoked',
        student: mapMemoryStudent(students[index]),
        studentId,
        revokedSessions,
      };
    },
  };
}

export function createPgAdminStudentRepository(client: QueryClient): AdminStudentRepository {
  return {
    async listStudents(filters) {
      const params: unknown[] = [];
      const where: string[] = [];

      if (filters.status) {
        addFilter(params, where, (placeholder) => `students.status = ${placeholder}`, filters.status);
      }
      if (filters.className) {
        addFilter(params, where, (placeholder) => `students.class_name = ${placeholder}`, filters.className);
      }
      if (filters.groupName) {
        addFilter(params, where, (placeholder) => `students.group_name = ${placeholder}`, filters.groupName);
      }
      if (filters.passwordResetRequired !== undefined) {
        addFilter(
          params,
          where,
          (placeholder) => `students.password_reset_required = ${placeholder}`,
          filters.passwordResetRequired,
        );
      }
      if (filters.lockedOnly) {
        where.push('students.locked_until IS NOT NULL AND students.locked_until > now()');
      }
      if (filters.keyword) {
        addFilter(
          params,
          where,
          (placeholder) => `(
            lower(students.login_name) LIKE ${placeholder} ESCAPE '\\'
            OR lower(students.display_name) LIKE ${placeholder} ESCAPE '\\'
          )`,
          `%${escapeLikePattern(filters.keyword.toLocaleLowerCase())}%`,
        );
      }

      params.push(filters.limit + 1);
      const limitPlaceholder = `$${params.length}`;
      params.push(filters.offset);
      const offsetPlaceholder = `$${params.length}`;

      const result = (await client.query(
        `
          ${adminStudentSelectSql()}
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY students.created_at DESC, students.id DESC
          LIMIT ${limitPlaceholder}
          OFFSET ${offsetPlaceholder}
        `,
        params,
      )) as QueryRows<AdminStudentRow>;
      const pageRows = result.rows.slice(0, filters.limit);

      return {
        students: pageRows.map(mapAdminStudentRow),
        page: {
          limit: filters.limit,
          offset: filters.offset,
          hasMore: result.rows.length > filters.limit,
        },
      };
    },

    async findStudentById(studentId) {
      return findPgStudentById(client, studentId);
    },

    async createStudent(input) {
      const studentId = randomUUID();
      const created = (await client.query(
        `
          INSERT INTO students (
            id,
            login_name,
            display_name,
            password_hash,
            class_name,
            group_name,
            status,
            password_reset_required,
            password_changed_at,
            failed_login_count,
            created_by_admin_id,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, 0, $9, $10, $10)
          ON CONFLICT (login_name) DO NOTHING
          RETURNING id
        `,
        [
          studentId,
          input.loginName,
          input.displayName,
          input.passwordHash,
          input.className,
          input.groupName,
          input.passwordResetRequired,
          input.passwordChangedAt,
          input.createdByAdminId,
          input.now,
        ],
      )) as QueryRows<{ id: string }>;
      if (!created.rows[0]) {
        return { status: 'login_name_conflict' };
      }

      const student = await findPgStudentById(client, studentId);
      if (!student) throw new Error(`Created student not found: ${studentId}`);

      return { status: 'created', student };
    },

    async updateStudent(input) {
      const before = await findPgStudentById(client, input.studentId);
      if (!before) return { status: 'not_found' };

      const assignments: string[] = [];
      const params: unknown[] = [];
      if (input.changes.displayName !== undefined) {
        params.push(input.changes.displayName);
        assignments.push(`display_name = $${params.length}`);
      }
      if (input.changes.status !== undefined) {
        params.push(input.changes.status);
        assignments.push(`status = $${params.length}`);
      }
      if (input.changes.className !== undefined) {
        params.push(input.changes.className);
        assignments.push(`class_name = $${params.length}`);
      }
      if (input.changes.groupName !== undefined) {
        params.push(input.changes.groupName);
        assignments.push(`group_name = $${params.length}`);
      }
      params.push(input.now);
      assignments.push(`updated_at = $${params.length}`);
      params.push(input.studentId);

      await client.query(
        `UPDATE students SET ${assignments.join(', ')} WHERE id = $${params.length}`,
        params,
      );

      const after = await findPgStudentById(client, input.studentId);
      if (!after) throw new Error(`Updated student not found: ${input.studentId}`);

      return { status: 'updated', before, after };
    },

    async resetStudentPassword(input) {
      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const lockResult = (await transactionClient.query(
          'SELECT id FROM students WHERE id = $1 FOR UPDATE',
          [input.studentId],
        )) as QueryRows<{ id: string }>;
        if (!lockResult.rows[0]) {
          await transactionClient.query('ROLLBACK');
          transactionStarted = false;
          return { status: 'not_found' };
        }

        await transactionClient.query(
          `
            UPDATE students
            SET password_hash = $2,
                password_reset_required = true,
                password_changed_at = NULL,
                failed_login_count = 0,
                failed_login_window_started_at = NULL,
                locked_until = NULL,
                updated_at = $3
            WHERE id = $1
          `,
          [input.studentId, input.passwordHash, input.now],
        );

        const revokedSessions = input.revokeExistingSessions
          ? await revokePgStudentSessions(transactionClient, input.studentId, input.now)
          : 0;

        const student = await findPgStudentById(transactionClient, input.studentId);
        if (!student) throw new Error(`Reset password student not found: ${input.studentId}`);

        await transactionClient.query('COMMIT');
        transactionStarted = false;

        return {
          status: 'updated',
          student,
          revokedSessions,
        };
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }
        throw error;
      } finally {
        if (transactionClient !== client) {
          transactionClient.release?.();
        }
      }
    },

    async revokeStudentSessions(studentId, now) {
      const student = await findPgStudentById(client, studentId);
      if (!student) return { status: 'not_found' };

      const revokedSessions = await revokePgStudentSessions(client, studentId, now);

      return {
        status: 'revoked',
        student,
        studentId,
        revokedSessions,
      };
    },
  };
}

async function findPgStudentById(client: QueryClient, studentId: string) {
  const result = (await client.query(
    `
      ${adminStudentSelectSql()}
      WHERE students.id = $1
      LIMIT 1
    `,
    [studentId],
  )) as QueryRows<AdminStudentRow>;
  const row = result.rows[0];
  return row ? mapAdminStudentRow(row) : null;
}

async function revokePgStudentSessions(client: QueryClient, studentId: string, now: Date) {
  const result = (await client.query(
    `
      UPDATE student_sessions
      SET revoked_at = $2
      WHERE student_id = $1
        AND revoked_at IS NULL
        AND expires_at > $2
      RETURNING id
    `,
    [studentId, now],
  )) as QueryRows<{ id: string }>;

  return result.rows.length;
}

function adminStudentSelectSql() {
  return `
    SELECT
      students.id,
      students.login_name,
      students.display_name,
      students.class_name,
      students.group_name,
      students.status,
      students.password_reset_required,
      students.password_changed_at,
      students.failed_login_count,
      students.locked_until,
      students.last_login_at,
      students.created_by_admin_id,
      creator.display_name AS created_by_admin_display_name,
      students.created_at,
      students.updated_at
    FROM students
    LEFT JOIN admin_users creator ON creator.id = students.created_by_admin_id
  `;
}

function mapMemoryStudent(student: MemoryAdminStudentRecord): AdminStudentV1 {
  return {
    id: student.id,
    loginName: student.loginName,
    displayName: student.displayName,
    className: student.className,
    groupName: student.groupName,
    status: student.status,
    passwordResetRequired: student.passwordResetRequired,
    passwordChangedAt: student.passwordChangedAt ? student.passwordChangedAt.toISOString() : null,
    failedLoginCount: student.failedLoginCount,
    lockedUntil: student.lockedUntil ? student.lockedUntil.toISOString() : null,
    lastLoginAt: student.lastLoginAt ? student.lastLoginAt.toISOString() : null,
    createdBy: student.createdByAdminId && student.createdByAdminDisplayName
      ? { id: student.createdByAdminId, displayName: student.createdByAdminDisplayName }
      : null,
    createdAt: student.createdAt.toISOString(),
    updatedAt: student.updatedAt.toISOString(),
  };
}

function mapAdminStudentRow(row: AdminStudentRow): AdminStudentV1 {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    className: row.class_name,
    groupName: row.group_name,
    status: row.status === 'disabled' ? 'disabled' : 'active',
    passwordResetRequired: row.password_reset_required,
    passwordChangedAt: row.password_changed_at ? toIsoTimestamp(row.password_changed_at) : null,
    failedLoginCount: Number(row.failed_login_count),
    lockedUntil: row.locked_until ? toIsoTimestamp(row.locked_until) : null,
    lastLoginAt: row.last_login_at ? toIsoTimestamp(row.last_login_at) : null,
    createdBy: row.created_by_admin_id && row.created_by_admin_display_name
      ? { id: row.created_by_admin_id, displayName: row.created_by_admin_display_name }
      : null,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

function matchesMemoryFilters(student: MemoryAdminStudentRecord, filters: ListAdminStudentsRequestV1) {
  if (filters.status && student.status !== filters.status) return false;
  if (filters.className && student.className !== filters.className) return false;
  if (filters.groupName && student.groupName !== filters.groupName) return false;
  if (
    filters.passwordResetRequired !== undefined
    && student.passwordResetRequired !== filters.passwordResetRequired
  ) return false;
  if (filters.lockedOnly && !student.lockedUntil) return false;
  if (filters.keyword) {
    const keyword = filters.keyword.toLocaleLowerCase();
    if (
      !student.loginName.toLocaleLowerCase().includes(keyword)
      && !student.displayName.toLocaleLowerCase().includes(keyword)
    ) return false;
  }
  return true;
}

function normalizeDisplayName(displayName: string | undefined, loginName: string) {
  return displayName?.trim() || loginName;
}

function normalizeCreateClassName(className: string | null | undefined, loginName: string) {
  if (className === undefined) return inferClassNameFromLoginName(loginName);
  return normalizeNullableText(className);
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

function addFilter(
  params: unknown[],
  where: string[],
  condition: (placeholder: string) => string,
  value: unknown,
) {
  params.push(value);
  where.push(condition(`$${params.length}`));
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function checkoutTransactionClient(client: QueryClient): Promise<TransactionClient> {
  return isConnectableQueryClient(client) && !('release' in client) ? client.connect() : client;
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return 'connect' in client && typeof client.connect === 'function';
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
