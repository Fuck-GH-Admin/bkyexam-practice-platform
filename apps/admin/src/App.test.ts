import { describe, expect, test } from 'vitest';
import type { AdminPermissionV1, AdminStudentV1 } from '@bkyexam-practice/shared';

import {
  buildAdminPath,
  buildStudentListQuery,
  buildStudentStatusBadges,
  buildVisibleAdminNavigation,
  parseAdminRoute,
  parseBulkStudentInput,
} from './App';

describe('admin route helpers', () => {
  test('parses and rebuilds implemented admin routes', () => {
    expect(parseAdminRoute('/admin')).toEqual({ kind: 'system' });
    expect(parseAdminRoute('/admin/students/create')).toEqual({ kind: 'students', panel: 'create' });
    expect(parseAdminRoute('/admin/students/bulk-create')).toEqual({ kind: 'students', panel: 'bulk-create' });
    expect(parseAdminRoute('/admin/students/student-1')).toEqual({ kind: 'students', studentId: 'student-1' });
    expect(buildAdminPath({ kind: 'students', studentId: 'student-1' })).toBe('/admin/students/student-1');
  });

  test('filters navigation by actual RBAC permissions', () => {
    const operatorPermissions: AdminPermissionV1[] = [
      'admin:self:read',
      'system_status:read',
      'import_job:read',
      'student_account:read',
      'student_account:write',
      'student_account:reset_password',
      'student_account:revoke_session',
    ];
    expect(buildVisibleAdminNavigation(operatorPermissions).map((item) => item.key)).toEqual([
      'system',
      'students',
      'import-jobs',
    ]);
  });
});

describe('student account helpers', () => {
  test('builds a compact query string without empty filters', () => {
    const filters = {
      keyword: '2025020402',
      className: '2班',
      groupName: '',
      status: 'active',
      passwordResetRequired: 'true',
      lockedOnly: true,
    } satisfies Parameters<typeof buildStudentListQuery>[0];

    expect(buildStudentListQuery(filters, 20, 40)).toBe(
      'limit=20&offset=40&keyword=2025020402&className=2%E7%8F%AD&status=active&passwordResetRequired=true&lockedOnly=true',
    );
  });

  test('parses CSV and JSON bulk-create input into API shaped student drafts', () => {
    expect(parseBulkStudentInput('loginName,displayName,className,groupName\n202502040201,张三,2班,A组')).toEqual([
      { loginName: '202502040201', displayName: '张三', initialPassword: undefined, className: '2班', groupName: 'A组' },
    ]);
    expect(parseBulkStudentInput(JSON.stringify({
      students: [{ loginName: '202502040202', initialPassword: 'temp-pass-123', className: null }],
    }))).toEqual([
      { loginName: '202502040202', initialPassword: 'temp-pass-123', className: null, displayName: undefined, groupName: undefined },
    ]);
  });

  test('summarizes disabled, reset-required, and locked student states', () => {
    const student: AdminStudentV1 = {
      id: '11111111-1111-4111-8111-111111111111',
      loginName: '202502040201',
      displayName: '202502040201',
      className: '2班',
      groupName: null,
      status: 'disabled',
      passwordResetRequired: true,
      passwordChangedAt: null,
      failedLoginCount: 10,
      lockedUntil: '2026-07-15T12:00:00.000Z',
      lastLoginAt: null,
      createdBy: { id: '99999999-9999-4999-8999-999999999999', displayName: 'Admin' },
      createdAt: '2026-07-15T10:00:00.000Z',
      updatedAt: '2026-07-15T11:00:00.000Z',
    };

    expect(buildStudentStatusBadges(student)[0]).toBe('disabled');
    expect(buildStudentStatusBadges(student)).toContain('待改密');
    expect(buildStudentStatusBadges(student).some((badge) => badge.startsWith('锁定至'))).toBe(true);
  });
});
