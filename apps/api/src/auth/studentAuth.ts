import { randomUUID } from 'node:crypto';
import type { QueryClient } from '../db/client.js';
import { hashPassword, verifyPassword } from './password.js';

export type StudentAccountStatus = 'active' | 'disabled';

export interface StudentAuthRecord {
  id?: string;
  loginName: string;
  displayName: string;
  passwordHash?: string;
  className?: string | null;
  groupName?: string | null;
  status?: StudentAccountStatus;
  passwordResetRequired?: boolean;
  passwordChangedAt?: Date | null;
  failedLoginCount?: number;
  failedLoginWindowStartedAt?: Date | null;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
  createdByAdminId?: string | null;
}

export interface StudentLoginResult {
  student: {
    loginName: string;
    displayName: string;
    className: string | null;
    groupName: string | null;
  };
  passwordResetRequired: boolean;
}

export interface StudentAuthRepository {
  findByLoginName(loginName: string): Promise<StudentAuthRecord | null>;
  createStudent(student: {
    loginName: string;
    displayName: string;
    passwordHash?: string;
    className?: string | null;
    groupName?: string | null;
    passwordResetRequired?: boolean;
  }): Promise<StudentAuthRecord>;
}

interface QueryRows<T> {
  rows: T[];
}

interface StudentAuthRow {
  id: string;
  login_name: string;
  display_name: string;
  password_hash: string | null;
  class_name: string | null;
  group_name: string | null;
  status: StudentAccountStatus;
  password_reset_required: boolean;
  password_changed_at: Date | null;
  failed_login_count: number;
  failed_login_window_started_at: Date | null;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_by_admin_id: string | null;
}

function mapStudentAuthRow(row: StudentAuthRow): StudentAuthRecord {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    passwordHash: row.password_hash ?? undefined,
    className: row.class_name,
    groupName: row.group_name,
    status: row.status,
    passwordResetRequired: row.password_reset_required,
    passwordChangedAt: row.password_changed_at,
    failedLoginCount: row.failed_login_count,
    failedLoginWindowStartedAt: row.failed_login_window_started_at,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    createdByAdminId: row.created_by_admin_id,
  };
}

export function createPgStudentAuthRepository(client: QueryClient): StudentAuthRepository {
  return {
    async findByLoginName(loginName) {
      const result = (await client.query(
        `
          SELECT
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
            failed_login_window_started_at,
            locked_until,
            last_login_at,
            created_by_admin_id
          FROM students
          WHERE login_name = $1
          LIMIT 1
        `,
        [loginName],
      )) as QueryRows<StudentAuthRow>;
      const row = result.rows[0];

      return row ? mapStudentAuthRow(row) : null;
    },

    async createStudent({ loginName, displayName, passwordHash, className, groupName, passwordResetRequired }) {
      const id = randomUUID();
      const result = (await client.query(
        `
          INSERT INTO students (
            id,
            login_name,
            display_name,
            password_hash,
            class_name,
            group_name,
            password_reset_required
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
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
            failed_login_window_started_at,
            locked_until,
            last_login_at,
            created_by_admin_id
        `,
        [
          id,
          loginName,
          displayName,
          passwordHash ?? null,
          className ?? null,
          groupName ?? null,
          passwordResetRequired ?? false,
        ],
      )) as QueryRows<StudentAuthRow>;

      return mapStudentAuthRow(result.rows[0]);
    },
  };
}

export function createStudentAuthService(repository: StudentAuthRepository) {
  return {
    async login({ loginName, password, now = new Date() }: { loginName: string; password?: string; now?: Date }) {
      const normalizedLoginName = loginName.trim();
      if (!normalizedLoginName) {
        throw new Error('loginName is required');
      }

      const existingStudent = await repository.findByLoginName(normalizedLoginName);
      if (existingStudent) {
        if ((existingStudent.status ?? 'active') === 'disabled') {
          throw new Error('Student account disabled');
        }
        if (existingStudent.lockedUntil && existingStudent.lockedUntil > now) {
          throw new Error('Student account locked');
        }

        // B9.5 still keeps legacy passwordless accounts for migration safety.
        // B9.7 will disable this by default behind an explicit legacy flag.
        if (existingStudent.passwordHash) {
          const verified = password
            ? await verifyPassword(password, existingStudent.passwordHash)
            : false;
          if (!verified) {
            throw new Error('Invalid login credentials');
          }
        }

        return toStudentLoginResult(existingStudent);
      }

      const createdStudent = await repository.createStudent({
        loginName: normalizedLoginName,
        displayName: normalizedLoginName,
        passwordHash: password ? await hashPassword(password) : undefined,
        className: inferClassNameFromLoginName(normalizedLoginName),
        groupName: null,
        passwordResetRequired: false,
      });

      return toStudentLoginResult(createdStudent);
    },
  };
}

export function inferClassNameFromLoginName(loginName: string): string | null {
  return /^\d{12}$/.test(loginName) && loginName >= '202502040201' && loginName <= '202502040230'
    ? '2班'
    : null;
}

function toStudentLoginResult(student: StudentAuthRecord): StudentLoginResult {
  return {
    student: {
      loginName: student.loginName,
      displayName: student.displayName,
      className: student.className ?? null,
      groupName: student.groupName ?? null,
    },
    passwordResetRequired: student.passwordResetRequired ?? false,
  };
}
