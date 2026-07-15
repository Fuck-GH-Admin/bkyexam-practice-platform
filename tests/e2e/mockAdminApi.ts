import type { Page, Route } from '@playwright/test';

import type {
  AdminBankMappingDetailV1,
  AdminImportJobV1,
  AdminPermissionV1,
  AdminStudentV1,
  BulkCreateAdminStudentItemV1,
} from '@bkyexam-practice/shared';

export type MockAdminState = {
  authenticated: boolean;
  calls: string[];
  students: AdminStudentV1[];
  bankMappings: AdminBankMappingDetailV1[];
  importJobs: AdminImportJobV1[];
};

const adminId = '99999999-9999-4999-8999-999999999999';
const now = '2026-07-15T10:00:00.000Z';

const allAdminPermissions: AdminPermissionV1[] = [
  'admin:self:read',
  'bank_mapping:read',
  'bank_mapping:write',
  'bank_mapping:publish',
  'question_review:read',
  'question_review:write',
  'import_job:read',
  'import_job:create',
  'system_status:read',
  'audit_log:read',
  'admin_user:manage',
  'student_account:read',
  'student_account:write',
  'student_account:reset_password',
  'student_account:revoke_session',
];

export function createMockAdminState(): MockAdminState {
  return {
    authenticated: false,
    calls: [],
    students: [
      buildStudent({
        id: '11111111-1111-4111-8111-111111111111',
        loginName: '202502040201',
        displayName: '202502040201',
        className: '2班',
        passwordResetRequired: true,
      }),
      buildStudent({
        id: '22222222-2222-4222-8222-222222222222',
        loginName: 'legacy001',
        displayName: 'legacy001',
        className: null,
        lastLoginAt: '2026-07-15T08:00:00.000Z',
      }),
    ],
    bankMappings: [
      buildBankMapping({
        bankId: '44444444-4444-4444-8444-444444444444',
        rawName: '公共课/数学/高等数学',
        bankName: '高等数学',
        status: 'review',
        visible: false,
        objectiveQuestionCount: 30,
      }),
      buildBankMapping({
        bankId: '55555555-5555-4555-8555-555555555555',
        rawName: '公共课/英语/大学英语',
        bankName: '大学英语',
        status: 'active',
        visible: true,
        objectiveQuestionCount: 18,
      }),
    ],
    importJobs: [
      buildImportJob({
        id: '33333333-3333-4333-8333-333333333333',
        status: 'succeeded',
        sourceDir: 'C:\\Users\\Bot\\Bot\\BKYExam\\questionbank',
      }),
      buildImportJob({
        id: '66666666-6666-4666-8666-666666666666',
        status: 'failed',
        sourceDir: 'C:\\bad-source',
        errorSummary: [{ message: 'source file is missing', file: 'questions.json' }],
      }),
    ],
  };
}

export async function installMockAdminApi(page: Page, state: MockAdminState) {
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    state.calls.push(`${method} ${pathname}`);

    if (method === 'POST' && pathname === '/api/admin/auth/login') {
      state.authenticated = true;
      return fulfillJson(route, adminSession());
    }

    if (method === 'POST' && pathname === '/api/admin/auth/logout') {
      state.authenticated = false;
      return fulfillJson(route, { success: true });
    }

    if (!state.authenticated) {
      return fulfillJson(route, { error: 'Unauthenticated' }, 401);
    }

    if (method === 'GET' && pathname === '/api/admin/me') {
      return fulfillJson(route, adminSession());
    }

    if (method === 'GET' && pathname === '/api/admin/system/status') {
      return fulfillJson(route, {
        api: { ok: true, service: 'bkyexam-practice-api', version: '0.1.0' },
        database: { ok: true, migrationCount: 11, currentMigration: '0011_admin_identity_security.sql' },
        corpus: {
          classifications: 2941,
          questions: 89922,
          questionOptions: 154899,
          bankMappings: 2662,
          visibleBanks: 473,
        },
        imports: {
          tableExists: true,
          runningJobId: null,
          lastJob: {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'succeeded',
            finishedAt: '2026-07-15T09:00:00.000Z',
          },
        },
        quality: {
          tableExists: true,
          openFlags: 2,
          blockingFlags: 0,
          excludedQuestions: 1,
        },
      });
    }

    if (method === 'GET' && pathname === '/api/admin/students') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const status = url.searchParams.get('status');
      const keyword = url.searchParams.get('keyword')?.toLowerCase() ?? '';
      const filtered = state.students.filter((student) => {
        if (status && student.status !== status) return false;
        if (keyword && !`${student.loginName} ${student.displayName}`.toLowerCase().includes(keyword)) return false;
        return true;
      });
      const pageItems = filtered.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        students: pageItems.slice(0, limit),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }

    if (method === 'GET' && pathname === '/api/admin/bank-mappings') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const status = url.searchParams.get('status');
      const visible = url.searchParams.get('visible');
      const keyword = url.searchParams.get('keyword')?.toLowerCase() ?? '';
      const filtered = state.bankMappings.filter((mapping) => {
        if (status && mapping.status !== status) return false;
        if (visible && mapping.visible !== (visible === 'true')) return false;
        if (keyword && !`${mapping.rawName} ${mapping.bankName} ${mapping.keywords.join(' ')}`.toLowerCase().includes(keyword)) return false;
        return true;
      });
      const pageItems = filtered.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        bankMappings: pageItems.slice(0, limit).map(toBankMappingListItem),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }

    if (method === 'GET' && pathname === '/api/admin/import-jobs') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const status = url.searchParams.get('status');
      const filtered = state.importJobs.filter((job) => {
        if (status && job.status !== status) return false;
        return true;
      });
      const pageItems = filtered.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        jobs: pageItems.slice(0, limit),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }

    if (method === 'POST' && pathname === '/api/admin/import-jobs') {
      const body = readBody<{
        sourceDir: string;
        mode: AdminImportJobV1['mode'];
        options: AdminImportJobV1['options'];
      }>(route);
      if (body.mode !== 'dry_run') {
        return fulfillJson(route, { error: 'Import mode is not enabled yet' }, 422);
      }
      if (body.sourceDir.toLowerCase().includes('forbidden')) {
        return fulfillJson(route, { error: 'Import source directory is not allowed' }, 403);
      }
      const job = buildImportJob({
        id: nextImportJobId(state.importJobs.length + 1),
        status: 'succeeded',
        sourceDir: body.sourceDir,
        options: body.options,
      });
      state.importJobs.unshift(job);
      return fulfillJson(route, { job });
    }

    const importJobErrorsMatch = pathname.match(/^\/api\/admin\/import-jobs\/([^/]+)\/errors$/);
    if (importJobErrorsMatch) {
      const jobId = importJobErrorsMatch[1];
      const job = state.importJobs.find((item) => item.id === jobId);
      if (!job) return fulfillJson(route, { error: 'Import job not found' }, 404);
      return fulfillJson(route, {
        jobId: job.id,
        status: job.status,
        errorSummary: job.errorSummary,
      });
    }

    const importJobMatch = pathname.match(/^\/api\/admin\/import-jobs\/([^/]+)$/);
    if (importJobMatch) {
      const jobId = importJobMatch[1];
      const job = state.importJobs.find((item) => item.id === jobId);
      if (!job) return fulfillJson(route, { error: 'Import job not found' }, 404);
      return fulfillJson(route, { job });
    }

    if (method === 'POST' && pathname === '/api/admin/bank-mappings/bulk-status') {
      const body = readBody<{
        items: Array<{ bankId: string; expectedVersion: number }>;
        changes: { visible?: boolean; status?: AdminBankMappingDetailV1['status'] };
      }>(route);
      const updated: Array<{ bankId: string; version: number }> = [];
      const failed: Array<{ bankId: string; error: string }> = [];
      for (const item of body.items) {
        const mapping = state.bankMappings.find((candidate) => candidate.bankId === item.bankId);
        if (!mapping) {
          failed.push({ bankId: item.bankId, error: 'not_found' });
          continue;
        }
        if (mapping.version !== item.expectedVersion) {
          failed.push({ bankId: item.bankId, error: 'version_conflict' });
          continue;
        }
        if (body.changes.status) mapping.status = body.changes.status;
        if (body.changes.visible !== undefined) mapping.visible = body.changes.visible;
        mapping.version += 1;
        mapping.updatedAt = '2026-07-15T10:50:00.000Z';
        mapping.updatedBy = { id: adminId, displayName: '平台管理员' };
        mapping.studentPreview = buildStudentPreview(mapping);
        updated.push({ bankId: mapping.bankId, version: mapping.version });
      }
      return fulfillJson(route, { updated, failed });
    }

    const bankMappingMatch = pathname.match(/^\/api\/admin\/bank-mappings\/([^/]+)$/);
    if (bankMappingMatch) {
      const bankId = bankMappingMatch[1];
      const mapping = state.bankMappings.find((item) => item.bankId === bankId);
      if (!mapping) return fulfillJson(route, { error: 'Bank mapping not found' }, 404);

      if (method === 'GET') {
        return fulfillJson(route, { bankMapping: mapping });
      }

      if (method === 'PATCH') {
        const body = readBody<{
          expectedVersion: number;
          changes: Partial<Pick<
            AdminBankMappingDetailV1,
            'bankName' | 'subjectCategory' | 'subjectName' | 'visible' | 'status' | 'difficulty' | 'examPurpose' | 'audience' | 'keywords' | 'description' | 'notes'
          >>;
        }>(route);
        if (body.expectedVersion !== mapping.version) {
          return fulfillJson(route, { error: 'Bank mapping version conflict' }, 409);
        }
        Object.assign(mapping, body.changes, {
          version: mapping.version + 1,
          updatedAt: '2026-07-15T10:45:00.000Z',
          updatedBy: { id: adminId, displayName: '平台管理员' },
        });
        mapping.studentPreview = buildStudentPreview(mapping);
        return fulfillJson(route, { bankMapping: mapping });
      }
    }

    if (method === 'POST' && pathname === '/api/admin/students') {
      const body = readBody<{
        loginName: string;
        displayName?: string;
        className?: string | null;
        groupName?: string | null;
        passwordResetRequired?: boolean;
      }>(route);
      if (state.students.some((student) => student.loginName === body.loginName)) {
        return fulfillJson(route, { error: 'Student loginName already exists' }, 409);
      }
      const student = buildStudent({
        id: nextStudentId(state.students.length + 1),
        loginName: body.loginName,
        displayName: body.displayName ?? body.loginName,
        className: body.className ?? null,
        groupName: body.groupName ?? null,
        passwordResetRequired: body.passwordResetRequired ?? true,
      });
      state.students.unshift(student);
      return fulfillJson(route, { student });
    }

    if (method === 'POST' && pathname === '/api/admin/students/bulk-create') {
      const body = readBody<{
        students: BulkCreateAdminStudentItemV1[];
        options: { skipExisting: boolean; passwordResetRequired: boolean };
      }>(route);
      const created: AdminStudentV1[] = [];
      const skipped: Array<{ loginName: string; reason: string }> = [];
      const failed: Array<{ loginName: string; error: string }> = [];
      for (const item of body.students) {
        if (state.students.some((student) => student.loginName === item.loginName)) {
          if (body.options.skipExisting) skipped.push({ loginName: item.loginName, reason: 'already_exists' });
          else failed.push({ loginName: item.loginName, error: 'already_exists' });
          continue;
        }
        const student = buildStudent({
          id: nextStudentId(state.students.length + created.length + 1),
          loginName: item.loginName,
          displayName: item.displayName ?? item.loginName,
          className: item.className ?? null,
          groupName: item.groupName ?? null,
          passwordResetRequired: body.options.passwordResetRequired,
        });
        created.push(student);
      }
      state.students.unshift(...created);
      return fulfillJson(route, { created, skipped, failed });
    }

    const studentMatch = pathname.match(/^\/api\/admin\/students\/([^/]+)(?:\/([^/]+))?$/);
    if (studentMatch) {
      const studentId = studentMatch[1];
      const action = studentMatch[2];
      const student = state.students.find((item) => item.id === studentId);
      if (!student) return fulfillJson(route, { error: 'Student account not found' }, 404);

      if (method === 'GET' && !action) {
        return fulfillJson(route, { student });
      }

      if (method === 'PATCH' && !action) {
        const body = readBody<Partial<Pick<AdminStudentV1, 'displayName' | 'status' | 'className' | 'groupName'>>>(route);
        Object.assign(student, {
          ...body,
          updatedAt: '2026-07-15T10:30:00.000Z',
        });
        return fulfillJson(route, { student });
      }

      if (method === 'POST' && action === 'reset-password') {
        student.passwordResetRequired = true;
        student.failedLoginCount = 0;
        student.lockedUntil = null;
        student.updatedAt = '2026-07-15T10:40:00.000Z';
        return fulfillJson(route, { student, revokedSessions: 1 });
      }

      if (method === 'POST' && action === 'revoke-sessions') {
        return fulfillJson(route, { studentId: student.id, revokedSessions: 1 });
      }
    }

    return fulfillJson(route, { error: `Unhandled mock route: ${method} ${pathname}` }, 500);
  });
}

function adminSession() {
  return {
    admin: {
      id: adminId,
      loginName: 'admin',
      displayName: '平台管理员',
      roles: ['super_admin'],
      permissions: allAdminPermissions,
    },
    expiresAt: '2026-07-15T18:00:00.000Z',
  };
}

function buildStudent(input: {
  id: string;
  loginName: string;
  displayName: string;
  className: string | null;
  groupName?: string | null;
  passwordResetRequired?: boolean;
  lastLoginAt?: string | null;
}): AdminStudentV1 {
  return {
    id: input.id,
    loginName: input.loginName,
    displayName: input.displayName,
    className: input.className,
    groupName: input.groupName ?? null,
    status: 'active',
    passwordResetRequired: input.passwordResetRequired ?? false,
    passwordChangedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: input.lastLoginAt ?? null,
    createdBy: { id: adminId, displayName: '平台管理员' },
    createdAt: now,
    updatedAt: now,
  };
}

function buildBankMapping(input: {
  bankId: string;
  rawName: string;
  bankName: string;
  status: AdminBankMappingDetailV1['status'];
  visible: boolean;
  objectiveQuestionCount: number;
}): AdminBankMappingDetailV1 {
  const mapping: AdminBankMappingDetailV1 = {
    bankId: input.bankId,
    rawName: input.rawName,
    bankName: input.bankName,
    subjectCategory: '公共课',
    subjectName: input.bankName.includes('英语') ? '英语' : '数学',
    parentId: null,
    parentName: null,
    qGroup: 2,
    visible: input.visible,
    status: input.status,
    difficulty: 'normal',
    examPurpose: 'practice',
    questionTypes: ['single_choice', 'true_false'],
    audience: 'student',
    keywords: [input.bankName],
    description: `${input.bankName} 练习题库`,
    notes: '',
    questionCount: input.objectiveQuestionCount,
    descendantQuestionCount: input.objectiveQuestionCount,
    objectiveQuestionCount: input.objectiveQuestionCount,
    version: 1,
    updatedAt: now,
    updatedBy: { id: adminId, displayName: '平台管理员' },
    questionTypeCounts: {
      single_choice: Math.max(0, input.objectiveQuestionCount - 5),
      true_false: Math.min(5, input.objectiveQuestionCount),
    },
    studentPreview: {
      visibleInStudentCatalog: false,
      reason: '',
    },
  };
  mapping.studentPreview = buildStudentPreview(mapping);
  return mapping;
}

function toBankMappingListItem(mapping: AdminBankMappingDetailV1) {
  const {
    parentName: _parentName,
    questionTypeCounts: _questionTypeCounts,
    studentPreview: _studentPreview,
    ...listItem
  } = mapping;
  return listItem;
}

function buildStudentPreview(mapping: AdminBankMappingDetailV1) {
  const visibleInStudentCatalog = mapping.visible && mapping.status === 'active' && mapping.objectiveQuestionCount > 0;
  return {
    visibleInStudentCatalog,
    reason: visibleInStudentCatalog ? 'active and visible with objective questions' : 'not active/visible or no objective questions',
  };
}

function buildImportJob(input: {
  id: string;
  status: AdminImportJobV1['status'];
  sourceDir: string;
  options?: AdminImportJobV1['options'];
  errorSummary?: AdminImportJobV1['errorSummary'];
}): AdminImportJobV1 {
  const questions = input.status === 'failed' ? 0 : 89922;
  const errorSummary = input.errorSummary ?? [];
  return {
    id: input.id,
    kind: 'full_corpus_import',
    mode: 'dry_run',
    status: input.status,
    sourceDir: input.sourceDir,
    options: input.options ?? {
      batchSize: 1000,
      resetBeforeImport: false,
      generateMappings: true,
    },
    progress: input.status === 'failed'
      ? { phase: 'failed', current: 0, total: 0 }
      : { phase: 'done', current: questions, total: questions },
    summary: input.status === 'failed'
      ? {}
      : {
        classifications: 2941,
        questions,
        rawOptions: 180323,
        options: 154899,
        skippedOptions: 25424,
        bankMappings: 2662,
        questionTypes: {
          single_choice: 60000,
          true_false: 29922,
        },
      },
    errorSummary,
    createdBy: { id: adminId, displayName: '平台管理员' },
    createdAt: now,
    startedAt: '2026-07-15T10:00:01.000Z',
    finishedAt: input.status === 'running' ? null : '2026-07-15T10:02:00.000Z',
  };
}

function nextStudentId(index: number) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
}

function nextImportJobId(index: number) {
  return `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`;
}

function readBody<T>(route: Route): T {
  return route.request().postDataJSON() as T;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}
