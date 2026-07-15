import type { AdminStudentV1 } from '@bkyexam-practice/shared';
import type { AdminStudentRow, MemoryAdminStudentRecord } from './types.js';

export function mapMemoryStudent(student: MemoryAdminStudentRecord): AdminStudentV1 {
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

export function mapAdminStudentRow(row: AdminStudentRow): AdminStudentV1 {
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

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
