import { randomUUID } from 'node:crypto';
import type { QueryClient } from '../db/client.js';
import { hashPassword, verifyPassword } from './password.js';

export interface StudentAuthRecord {
  id?: string;
  loginName: string;
  displayName: string;
  passwordHash?: string;
}

export interface StudentAuthRepository {
  findByLoginName(loginName: string): Promise<StudentAuthRecord | null>;
  createStudent(student: {
    loginName: string;
    displayName: string;
    passwordHash?: string;
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
}

function mapStudentAuthRow(row: StudentAuthRow): StudentAuthRecord {
  return {
    id: row.id,
    loginName: row.login_name,
    displayName: row.display_name,
    passwordHash: row.password_hash ?? undefined,
  };
}

export function createPgStudentAuthRepository(client: QueryClient): StudentAuthRepository {
  return {
    async findByLoginName(loginName) {
      const result = (await client.query(
        `
          SELECT id, login_name, display_name, password_hash
          FROM students
          WHERE login_name = $1
          LIMIT 1
        `,
        [loginName],
      )) as QueryRows<StudentAuthRow>;
      const row = result.rows[0];

      return row ? mapStudentAuthRow(row) : null;
    },

    async createStudent({ loginName, displayName, passwordHash }) {
      const id = randomUUID();
      const result = (await client.query(
        `
          INSERT INTO students (id, login_name, display_name, password_hash)
          VALUES ($1, $2, $3, $4)
          RETURNING id, login_name, display_name, password_hash
        `,
        [id, loginName, displayName, passwordHash ?? null],
      )) as QueryRows<StudentAuthRow>;

      return mapStudentAuthRow(result.rows[0]);
    },
  };
}

export function createStudentAuthService(repository: StudentAuthRepository) {
  return {
    async login({ loginName, password }: { loginName: string; password?: string }) {
      const normalizedLoginName = loginName.trim();
      if (!normalizedLoginName) {
        throw new Error('loginName is required');
      }

      const existingStudent = await repository.findByLoginName(normalizedLoginName);
      if (existingStudent) {
        // Phase 2 intentionally allows passwordless local-practice identities until persistent session policy is added.
        if (existingStudent.passwordHash) {
          const verified = password
            ? await verifyPassword(password, existingStudent.passwordHash)
            : false;
          if (!verified) {
            throw new Error('Invalid login credentials');
          }
        }

        return {
          loginName: existingStudent.loginName,
          displayName: existingStudent.displayName,
        };
      }

      const createdStudent = await repository.createStudent({
        loginName: normalizedLoginName,
        displayName: normalizedLoginName,
        passwordHash: password ? await hashPassword(password) : undefined,
      });

      return {
        loginName: createdStudent.loginName,
        displayName: createdStudent.displayName,
      };
    },
  };
}
