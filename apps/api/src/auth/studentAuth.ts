import { randomUUID } from 'node:crypto';
import type { QueryClient } from '../db/client.js';
import { hashPassword, verifyPassword } from './password.js';

export type StudentAccountStatus = 'active' | 'disabled';

export const STUDENT_AUTH_ERRORS = {
  loginNameRequired: 'loginName is required',
  passwordRequired: 'Student password is required',
  currentPasswordRequired: 'Student current password is required',
  newPasswordTooShort: 'Student new password is too short',
  newPasswordMustDiffer: 'Student new password must be different',
  invalidCredentials: 'Invalid login credentials',
  accountDisabled: 'Student account disabled',
  accountLocked: 'Student account locked',
  accountNotFound: 'Student account not found',
} as const;

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

export interface StudentLoginFailureUpdate {
  loginName: string;
  failedLoginCount: number;
  failedLoginWindowStartedAt: Date;
  lockedUntil: Date | null;
  now: Date;
}

export interface StudentLoginSuccessUpdate {
  loginName: string;
  now: Date;
}

export interface StudentPasswordUpdate {
  studentId: string;
  passwordHash: string;
  passwordChangedAt: Date;
}

export interface StudentAuthRepository {
  findByLoginName(loginName: string): Promise<StudentAuthRecord | null>;
  findById(studentId: string): Promise<StudentAuthRecord | null>;
  createStudent(student: {
    loginName: string;
    displayName: string;
    passwordHash?: string;
    className?: string | null;
    groupName?: string | null;
    passwordResetRequired?: boolean;
  }): Promise<StudentAuthRecord>;
  recordLoginFailure(input: StudentLoginFailureUpdate): Promise<void>;
  recordLoginSuccess(input: StudentLoginSuccessUpdate): Promise<void>;
  updateStudentPassword(input: StudentPasswordUpdate): Promise<StudentAuthRecord | null>;
}

export interface StudentAuthServiceOptions {
  legacyPasswordlessLoginEnabled?: boolean;
  maxFailedLoginCount?: number;
  failureWindowMinutes?: number;
  lockMinutes?: number;
}

interface NormalizedStudentAuthServiceOptions {
  legacyPasswordlessLoginEnabled: boolean;
  maxFailedLoginCount: number;
  failureWindowMs: number;
  lockMs: number;
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

const DEFAULT_MAX_FAILED_LOGIN_COUNT = 10;
const DEFAULT_FAILURE_WINDOW_MINUTES = 30;
const DEFAULT_LOCK_MINUTES = 15;

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
    findByLoginName(loginName) {
      return findPgStudentByLoginName(client, loginName);
    },

    findById(studentId) {
      return findPgStudentById(client, studentId);
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
            ${studentAuthColumns()}
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

    async recordLoginFailure(input) {
      await client.query(
        `
          UPDATE students
          SET failed_login_count = $2,
              failed_login_window_started_at = $3,
              locked_until = $4,
              updated_at = $5
          WHERE login_name = $1
        `,
        [
          input.loginName,
          input.failedLoginCount,
          input.failedLoginWindowStartedAt,
          input.lockedUntil,
          input.now,
        ],
      );
    },

    async recordLoginSuccess(input) {
      await client.query(
        `
          UPDATE students
          SET failed_login_count = 0,
              failed_login_window_started_at = NULL,
              locked_until = NULL,
              last_login_at = $2,
              updated_at = $2
          WHERE login_name = $1
        `,
        [input.loginName, input.now],
      );
    },

    async updateStudentPassword(input) {
      const result = (await client.query(
        `
          UPDATE students
          SET password_hash = $2,
              password_reset_required = false,
              password_changed_at = $3,
              failed_login_count = 0,
              failed_login_window_started_at = NULL,
              locked_until = NULL,
              updated_at = $3
          WHERE id = $1
          RETURNING id
        `,
        [input.studentId, input.passwordHash, input.passwordChangedAt],
      )) as QueryRows<{ id: string }>;
      if (!result.rows[0]) return null;

      return findPgStudentById(client, input.studentId);
    },
  };
}

export function createStudentAuthService(
  repository: StudentAuthRepository,
  options: StudentAuthServiceOptions = {},
) {
  const normalizedOptions = normalizeStudentAuthOptions(options);

  return {
    async login({ loginName, password, now = new Date() }: { loginName: string; password?: string; now?: Date }) {
      const normalizedLoginName = normalizeLoginName(loginName);
      const existingStudent = await repository.findByLoginName(normalizedLoginName);

      if (!existingStudent) {
        if (normalizedOptions.legacyPasswordlessLoginEnabled && password === undefined) {
          const createdStudent = await repository.createStudent({
            loginName: normalizedLoginName,
            displayName: normalizedLoginName,
            className: inferClassNameFromLoginName(normalizedLoginName),
            groupName: null,
            passwordResetRequired: false,
          });
          await repository.recordLoginSuccess({ loginName: createdStudent.loginName, now });
          return toStudentLoginResult(createdStudent);
        }

        if (!password) {
          throw new Error(STUDENT_AUTH_ERRORS.passwordRequired);
        }
        throw new Error(STUDENT_AUTH_ERRORS.invalidCredentials);
      }

      assertStudentCanAttemptLogin(existingStudent, now);

      if (!existingStudent.passwordHash) {
        if (normalizedOptions.legacyPasswordlessLoginEnabled && password === undefined) {
          await repository.recordLoginSuccess({ loginName: existingStudent.loginName, now });
          return toStudentLoginResult(existingStudent);
        }

        if (!password) {
          throw new Error(STUDENT_AUTH_ERRORS.passwordRequired);
        }

        await recordLoginFailure(repository, existingStudent, now, normalizedOptions);
        throw new Error(STUDENT_AUTH_ERRORS.invalidCredentials);
      }

      if (!password) {
        throw new Error(STUDENT_AUTH_ERRORS.passwordRequired);
      }

      const verified = await verifyPassword(password, existingStudent.passwordHash);
      if (!verified) {
        await recordLoginFailure(repository, existingStudent, now, normalizedOptions);
        throw new Error(STUDENT_AUTH_ERRORS.invalidCredentials);
      }

      await repository.recordLoginSuccess({ loginName: existingStudent.loginName, now });
      return toStudentLoginResult(existingStudent);
    },

    async changePassword({
      studentId,
      currentPassword,
      newPassword,
      now = new Date(),
    }: {
      studentId: string;
      currentPassword: string;
      newPassword: string;
      now?: Date;
    }) {
      if (!currentPassword) {
        throw new Error(STUDENT_AUTH_ERRORS.currentPasswordRequired);
      }
      if (newPassword.length < 8) {
        throw new Error(STUDENT_AUTH_ERRORS.newPasswordTooShort);
      }
      if (currentPassword === newPassword) {
        throw new Error(STUDENT_AUTH_ERRORS.newPasswordMustDiffer);
      }

      const student = await repository.findById(studentId);
      if (!student) {
        throw new Error(STUDENT_AUTH_ERRORS.accountNotFound);
      }
      assertStudentCanAttemptLogin(student, now);

      if (!student.passwordHash) {
        throw new Error(STUDENT_AUTH_ERRORS.invalidCredentials);
      }

      const verified = await verifyPassword(currentPassword, student.passwordHash);
      if (!verified) {
        await recordLoginFailure(repository, student, now, normalizedOptions);
        throw new Error(STUDENT_AUTH_ERRORS.invalidCredentials);
      }

      const updatedStudent = await repository.updateStudentPassword({
        studentId,
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: now,
      });
      if (!updatedStudent) {
        throw new Error(STUDENT_AUTH_ERRORS.accountNotFound);
      }

      return toStudentLoginResult(updatedStudent);
    },
  };
}

export function inferClassNameFromLoginName(loginName: string): string | null {
  return /^\d{12}$/.test(loginName) && loginName >= '202502040201' && loginName <= '202502040230'
    ? '2班'
    : null;
}

async function findPgStudentByLoginName(client: QueryClient, loginName: string) {
  const result = (await client.query(
    `
      SELECT
        ${studentAuthColumns()}
      FROM students
      WHERE login_name = $1
      LIMIT 1
    `,
    [loginName],
  )) as QueryRows<StudentAuthRow>;
  const row = result.rows[0];

  return row ? mapStudentAuthRow(row) : null;
}

async function findPgStudentById(client: QueryClient, studentId: string) {
  const result = (await client.query(
    `
      SELECT
        ${studentAuthColumns()}
      FROM students
      WHERE id = $1
      LIMIT 1
    `,
    [studentId],
  )) as QueryRows<StudentAuthRow>;
  const row = result.rows[0];

  return row ? mapStudentAuthRow(row) : null;
}

function studentAuthColumns() {
  return `
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
  `;
}

function normalizeStudentAuthOptions(options: StudentAuthServiceOptions): NormalizedStudentAuthServiceOptions {
  return {
    legacyPasswordlessLoginEnabled: options.legacyPasswordlessLoginEnabled ?? false,
    maxFailedLoginCount: normalizePositiveInteger(options.maxFailedLoginCount, DEFAULT_MAX_FAILED_LOGIN_COUNT),
    failureWindowMs: normalizePositiveInteger(
      options.failureWindowMinutes,
      DEFAULT_FAILURE_WINDOW_MINUTES,
    ) * 60 * 1000,
    lockMs: normalizePositiveInteger(options.lockMinutes, DEFAULT_LOCK_MINUTES) * 60 * 1000,
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeLoginName(loginName: string) {
  const normalizedLoginName = loginName.trim();
  if (!normalizedLoginName) {
    throw new Error(STUDENT_AUTH_ERRORS.loginNameRequired);
  }

  return normalizedLoginName;
}

function assertStudentCanAttemptLogin(student: StudentAuthRecord, now: Date) {
  if ((student.status ?? 'active') === 'disabled') {
    throw new Error(STUDENT_AUTH_ERRORS.accountDisabled);
  }
  if (student.lockedUntil && student.lockedUntil > now) {
    throw new Error(STUDENT_AUTH_ERRORS.accountLocked);
  }
}

async function recordLoginFailure(
  repository: StudentAuthRepository,
  student: StudentAuthRecord,
  now: Date,
  options: NormalizedStudentAuthServiceOptions,
) {
  const failedLoginWindowStartedAt = isFailureWindowActive(student, now, options.failureWindowMs)
    ? student.failedLoginWindowStartedAt!
    : now;
  const failedLoginCount = isFailureWindowActive(student, now, options.failureWindowMs)
    ? (student.failedLoginCount ?? 0) + 1
    : 1;
  const lockedUntil = failedLoginCount >= options.maxFailedLoginCount
    ? new Date(now.getTime() + options.lockMs)
    : null;

  await repository.recordLoginFailure({
    loginName: student.loginName,
    failedLoginCount,
    failedLoginWindowStartedAt,
    lockedUntil,
    now,
  });
}

function isFailureWindowActive(student: StudentAuthRecord, now: Date, failureWindowMs: number) {
  if (!student.failedLoginWindowStartedAt) return false;
  return now.getTime() - student.failedLoginWindowStartedAt.getTime() <= failureWindowMs;
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
