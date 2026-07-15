import { describe, expect, test } from 'vitest';
import type { AdminBankMappingListItemV1, AdminPermissionV1, AdminStudentV1 } from '@bkyexam-practice/shared';

import {
  buildAdminPath,
  buildBankMappingListQuery,
  buildBankMappingStatusBadges,
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
    expect(parseAdminRoute('/admin/bank-mappings/11111111-1111-4111-8111-111111111111')).toEqual({
      kind: 'bank-mappings',
      bankId: '11111111-1111-4111-8111-111111111111',
    });
    expect(buildAdminPath({ kind: 'students', studentId: 'student-1' })).toBe('/admin/students/student-1');
    expect(buildAdminPath({ kind: 'bank-mappings', bankId: '11111111-1111-4111-8111-111111111111' })).toBe(
      '/admin/bank-mappings/11111111-1111-4111-8111-111111111111',
    );
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

describe('bank mapping helpers', () => {
  test('builds a compact bank mapping query string', () => {
    const filters = {
      keyword: '数学',
      status: 'review',
      visible: 'false',
      subjectCategory: '公共课',
      subjectName: '',
      qGroup: '2',
      hasObjectiveQuestions: 'true',
    } satisfies Parameters<typeof buildBankMappingListQuery>[0];

    expect(buildBankMappingListQuery(filters, 20, 0)).toBe(
      'limit=20&offset=0&keyword=%E6%95%B0%E5%AD%A6&status=review&visible=false&subjectCategory=%E5%85%AC%E5%85%B1%E8%AF%BE&qGroup=2&hasObjectiveQuestions=true',
    );
  });

  test('summarizes bank mapping publishing blockers', () => {
    const mapping: AdminBankMappingListItemV1 = {
      bankId: '11111111-1111-4111-8111-111111111111',
      rawName: 'raw math',
      bankName: '高等数学',
      subjectCategory: '公共课',
      subjectName: '数学',
      parentId: '22222222-2222-4222-8222-222222222222',
      qGroup: 2,
      visible: false,
      status: 'review',
      difficulty: 'normal',
      examPurpose: 'practice',
      questionTypes: ['single_choice'],
      audience: 'student',
      keywords: ['数学'],
      description: '',
      notes: '',
      questionCount: 0,
      descendantQuestionCount: 0,
      objectiveQuestionCount: 0,
      version: 1,
      updatedAt: '2026-07-15T10:00:00.000Z',
      updatedBy: null,
    };

    expect(buildBankMappingStatusBadges(mapping)).toEqual([
      'review',
      'hidden-from-students',
      'no-objective-questions',
      'child-bank',
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
