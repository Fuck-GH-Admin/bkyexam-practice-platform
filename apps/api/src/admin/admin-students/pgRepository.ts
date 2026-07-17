import { randomUUID } from 'node:crypto';
import type { QueryClient } from '../../db/client.js';
import type {
  AdminStudentRepository,
  AdminStudentRow,
  ConnectableQueryClient,
  QueryRows,
  TransactionClient,
} from './types.js';
import { mapAdminStudentRow } from './mappers.js';

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
