import type {
  AdminStudentListResponseV1,
  AdminStudentStatusV1,
  AdminStudentV1,
  ResetAdminStudentPasswordResponseV1,
  RevokeAdminStudentSessionsResponseV1,
  ListAdminStudentsRequestV1,
} from '@bkyexam-practice/shared';
import type { QueryClient } from '../../db/client.js';

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

export interface MemoryAdminStudentRecord {
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

export interface QueryRows<T> {
  rows: T[];
}

export interface AdminStudentRow {
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

export type TransactionClient = QueryClient & { release?: () => void };

export interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}
