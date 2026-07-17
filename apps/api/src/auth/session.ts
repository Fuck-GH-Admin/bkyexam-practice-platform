import { createHash, randomBytes } from 'node:crypto';
import type { QueryClient } from '../db/client.js';

export interface SessionStudent {
  id: string;
  loginName: string;
  displayName: string;
  className?: string | null;
  groupName?: string | null;
  passwordResetRequired?: boolean;
}

export interface StudentSessionRepository {
  createSession(input: { studentId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  findStudentByTokenHash(tokenHash: string, now: Date): Promise<SessionStudent | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionService(
  repository: StudentSessionRepository,
  options: { ttlDays: number },
) {
  return {
    async createSession(studentId: string, now = new Date()) {
      const token = generateSessionToken();
      const expiresAt = new Date(now.getTime() + options.ttlDays * 24 * 60 * 60 * 1000);
      await repository.createSession({ studentId, tokenHash: hashSessionToken(token), expiresAt });

      return { token, expiresAt };
    },

    async resolveStudent(token: string | undefined, now = new Date()) {
      if (!token) return null;

      return repository.findStudentByTokenHash(hashSessionToken(token), now);
    },

    async revokeSession(token: string | undefined, now = new Date()) {
      if (!token) return;

      await repository.revokeSession(hashSessionToken(token), now);
    },
  };
}

export function createNoopStudentSessionRepository(): StudentSessionRepository {
  return {
    async createSession() {},
    async findStudentByTokenHash() {
      return null;
    },
    async revokeSession() {},
  };
}

export function createMemoryStudentSessionRepository(): StudentSessionRepository {
  const sessions = new Map<
    string,
    { student: SessionStudent; expiresAt: Date; revokedAt?: Date }
  >();

  return {
    async createSession({ studentId, tokenHash, expiresAt }) {
      sessions.set(tokenHash, {
        student: { id: studentId, loginName: studentId, displayName: studentId },
        expiresAt,
      });
    },

    async findStudentByTokenHash(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (!session || session.revokedAt || session.expiresAt <= now) {
        return null;
      }

      return session.student;
    },

    async revokeSession(tokenHash, now) {
      const session = sessions.get(tokenHash);
      if (session && !session.revokedAt) {
        session.revokedAt = now;
      }
    },
  };
}

interface QueryRows<T> {
  rows: T[];
}

interface SessionStudentRow {
  id: string;
  login_name: string;
  display_name: string;
  class_name: string | null;
  group_name: string | null;
  password_reset_required: boolean;
}

export function createPgStudentSessionRepository(client: QueryClient): StudentSessionRepository {
  return {
    async createSession({ studentId, tokenHash, expiresAt }) {
      await client.query(
        `
          INSERT INTO student_sessions (student_id, token_hash, expires_at)
          VALUES ($1, $2, $3)
        `,
        [studentId, tokenHash, expiresAt],
      );
    },

    async findStudentByTokenHash(tokenHash, now) {
      const result = (await client.query(
        `
          SELECT
            students.id,
            students.login_name,
            students.display_name,
            students.class_name,
            students.group_name,
            students.password_reset_required
          FROM student_sessions
          JOIN students ON students.id = student_sessions.student_id
          WHERE student_sessions.token_hash = $1
            AND student_sessions.revoked_at IS NULL
            AND student_sessions.expires_at > $2
            AND students.status = 'active'
          LIMIT 1
        `,
        [tokenHash, now],
      )) as QueryRows<SessionStudentRow>;
      const row = result.rows[0];
      if (!row) return null;

      return {
        id: row.id,
        loginName: row.login_name,
        displayName: row.display_name,
        className: row.class_name,
        groupName: row.group_name,
        passwordResetRequired: row.password_reset_required,
      };
    },

    async revokeSession(tokenHash, now) {
      await client.query(
        `
          UPDATE student_sessions
          SET revoked_at = $2
          WHERE token_hash = $1
            AND revoked_at IS NULL
        `,
        [tokenHash, now],
      );
    },
  };
}
