import { describe, expect, test } from 'vitest';
import type {
  AdminAuditLogEntryV1,
  AdminBankMappingListItemV1,
  AdminImportJobV1,
  AdminPermissionV1,
  AdminQuestionReviewItemV1,
  AdminStudentV1,
} from '@bkyexam-practice/shared';

import {
  buildAdminPath,
  buildAuditLogBadges,
  buildAuditLogListQuery,
  buildBankMappingListQuery,
  buildBankMappingStatusBadges,
  buildImportJobListQuery,
  buildImportJobStatusBadges,
  buildQuestionReviewBadges,
  buildQuestionReviewListQuery,
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
    expect(parseAdminRoute('/admin/import-jobs/create')).toEqual({ kind: 'import-jobs', panel: 'create' });
    expect(parseAdminRoute('/admin/import-jobs/33333333-3333-4333-8333-333333333333')).toEqual({
      kind: 'import-jobs',
      jobId: '33333333-3333-4333-8333-333333333333',
    });
    expect(parseAdminRoute('/admin/question-review/77777777-7777-4777-8777-777777777777')).toEqual({
      kind: 'question-review',
      questionId: '77777777-7777-4777-8777-777777777777',
    });
    expect(parseAdminRoute('/admin/audit-logs/99999999-9999-4999-8999-999999999999')).toEqual({
      kind: 'audit-logs',
      auditLogId: '99999999-9999-4999-8999-999999999999',
    });
    expect(buildAdminPath({ kind: 'students', studentId: 'student-1' })).toBe('/admin/students/student-1');
    expect(buildAdminPath({ kind: 'bank-mappings', bankId: '11111111-1111-4111-8111-111111111111' })).toBe(
      '/admin/bank-mappings/11111111-1111-4111-8111-111111111111',
    );
    expect(buildAdminPath({ kind: 'import-jobs', jobId: '33333333-3333-4333-8333-333333333333' })).toBe(
      '/admin/import-jobs/33333333-3333-4333-8333-333333333333',
    );
    expect(buildAdminPath({ kind: 'question-review', questionId: '77777777-7777-4777-8777-777777777777' })).toBe(
      '/admin/question-review/77777777-7777-4777-8777-777777777777',
    );
    expect(buildAdminPath({ kind: 'audit-logs', auditLogId: '99999999-9999-4999-8999-999999999999' })).toBe(
      '/admin/audit-logs/99999999-9999-4999-8999-999999999999',
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

describe('import job helpers', () => {
  test('builds import job query and status badges', () => {
    expect(buildImportJobListQuery({ status: 'failed' }, 20, 20)).toBe('limit=20&offset=20&status=failed');

    const job: AdminImportJobV1 = {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'full_corpus_import',
      mode: 'dry_run',
      status: 'failed',
      sourceDir: 'C:\\questionbank',
      options: {
        batchSize: 1000,
        resetBeforeImport: true,
        generateMappings: true,
      },
      progress: { phase: 'failed', current: 0, total: 0 },
      summary: {},
      errorSummary: [{ message: 'bad source' }],
      createdBy: { id: '99999999-9999-4999-8999-999999999999', displayName: 'Admin' },
      createdAt: '2026-07-15T10:00:00.000Z',
      startedAt: '2026-07-15T10:00:01.000Z',
      finishedAt: '2026-07-15T10:00:02.000Z',
    };

    expect(buildImportJobStatusBadges(job)).toEqual([
      'failed',
      'dry_run',
      'reset-requested',
      'has-errors',
    ]);
  });
});

describe('question review helpers', () => {
  test('builds question review query and badges', () => {
    expect(buildQuestionReviewListQuery({
      keyword: '答案',
      bankId: '',
      questionType: 'single_choice',
      flagType: 'bad_answer',
      severity: 'blocking',
      status: 'open',
    }, 20, 0)).toBe(
      'limit=20&offset=0&status=open&keyword=%E7%AD%94%E6%A1%88&questionType=single_choice&flagType=bad_answer&severity=blocking',
    );

    const question: AdminQuestionReviewItemV1 = {
      questionId: '77777777-7777-4777-8777-777777777777',
      bankId: '44444444-4444-4444-8444-444444444444',
      bankName: '高等数学',
      questionType: 'single_choice',
      contentPreview: '1+1=?',
      optionCount: 4,
      answerPreview: 'B',
      excludedFromPractice: true,
      flags: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          type: 'bad_answer',
          severity: 'blocking',
          status: 'open',
          note: '答案疑似错误',
          createdAt: '2026-07-15T10:00:00.000Z',
          createdBy: null,
          resolvedAt: null,
          resolvedBy: null,
        },
      ],
    };

    expect(buildQuestionReviewBadges(question)).toEqual([
      'single_choice',
      'excluded-from-practice',
      'blocking',
      '1 open flag',
    ]);
  });
});

describe('audit log helpers', () => {
  test('builds audit log query and badges', () => {
    expect(buildAuditLogListQuery({
      actorAdminId: '99999999-9999-4999-8999-999999999999',
      action: 'bank_mapping.update',
      resourceType: 'bank_mapping',
      resourceId: '',
      result: 'success',
      createdFrom: '2026-07-15T10:00:00.000Z',
      createdTo: '',
    }, 20, 40)).toBe(
      'limit=20&offset=40&actorAdminId=99999999-9999-4999-8999-999999999999&action=bank_mapping.update&resourceType=bank_mapping&result=success&createdFrom=2026-07-15T10%3A00%3A00.000Z',
    );

    const entry: AdminAuditLogEntryV1 = {
      id: '99999999-9999-4999-8999-999999999999',
      actor: null,
      action: 'admin_user.bootstrap',
      resourceType: 'admin_user',
      resourceId: 'admin',
      before: null,
      after: { loginName: 'admin' },
      metadata: { source: 'bootstrap' },
      result: 'success',
      createdAt: '2026-07-15T10:00:00.000Z',
    };

    expect(buildAuditLogBadges(entry)).toEqual([
      'success',
      'admin_user',
      'system-actor',
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
