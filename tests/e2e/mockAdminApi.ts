import type { Page, Route } from '@playwright/test';

import type {
  AdminAuditLogEntryV1,
  AdminBankMappingDetailV1,
  AdminImportJobV1,
  AdminManagedUserV1,
  AdminPermissionV1,
  AdminQuestionReviewFlagV1,
  AdminQuestionReviewDetailV1,
  AdminQuestionReviewItemV1,
  AdminQuestionOverrideRevisionV1,
  AdminRoleV1,
  AdminStudentV1,
  BulkCreateAdminStudentItemV1,
} from '@bkyexam-practice/shared';

export type MockAdminState = {
  authenticated: boolean;
  calls: string[];
  students: AdminStudentV1[];
  bankMappings: AdminBankMappingDetailV1[];
  importJobs: AdminImportJobV1[];
  questionReviews: AdminQuestionReviewDetailV1[];
  auditLogs: AdminAuditLogEntryV1[];
  adminUsers: AdminManagedUserV1[];
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
  'question_review:approve',
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
    questionReviews: [
      buildQuestionReview({
        questionId: '77777777-7777-4777-8777-777777777777',
        bankId: '44444444-4444-4444-8444-444444444444',
        bankName: '高等数学（校内版）',
        questionType: 'single_choice',
        excludedFromPractice: false,
        flags: [
          buildQuestionReviewFlag({
            id: '88888888-8888-4888-8888-888888888888',
            type: 'bad_answer',
            severity: 'blocking',
            note: '答案疑似错误',
          }),
        ],
      }),
    ],
    auditLogs: [
      buildAuditLog({
        id: '99999999-9999-4999-8999-000000000001',
        action: 'bank_mapping.update',
        resourceType: 'bank_mapping',
        resourceId: '44444444-4444-4444-8444-444444444444',
        before: { bankName: '高等数学' },
        after: { bankName: '高等数学（校内版）' },
        metadata: { bankId: '44444444-4444-4444-8444-444444444444' },
      }),
      buildAuditLog({
        id: '99999999-9999-4999-8999-000000000002',
        actor: null,
        action: 'admin_user.bootstrap',
        resourceType: 'admin_user',
        resourceId: 'admin',
        before: null,
        after: { loginName: 'admin' },
        metadata: { source: 'bootstrap' },
      }),
    ],
    adminUsers: [
      buildAdminUser({
        id: adminId,
        loginName: 'admin',
        displayName: '平台管理员',
        roles: ['super_admin'],
        lastLoginAt: '2026-07-15T08:00:00.000Z',
      }),
      buildAdminUser({
        id: '99999999-9999-4999-8999-000000000003',
        loginName: 'operator01',
        displayName: '运营管理员',
        roles: ['operator'],
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
        database: { ok: true, migrationCount: 15, currentMigration: '0015_import_job_events.sql' },
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

    if (method === 'GET' && pathname === '/api/admin/question-review') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const status = url.searchParams.get('status') ?? 'open';
      const severity = url.searchParams.get('severity');
      const flagType = url.searchParams.get('flagType');
      const questionType = url.searchParams.get('questionType');
      const keyword = url.searchParams.get('keyword')?.toLowerCase() ?? '';
      const filtered = state.questionReviews
        .map((question) => ({
          ...question,
          flags: question.flags.filter((flag) => {
            if (status && flag.status !== status) return false;
            if (severity && flag.severity !== severity) return false;
            if (flagType && flag.type !== flagType) return false;
            return true;
          }),
        }))
        .filter((question) => {
          if (question.flags.length === 0) return false;
          if (questionType && question.questionType !== questionType) return false;
          if (keyword && !`${question.bankName} ${question.contentPreview} ${question.answerPreview}`.toLowerCase().includes(keyword)) return false;
          return true;
        });
      const pageItems = filtered.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        questions: pageItems.slice(0, limit).map(toQuestionReviewItem),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }

    const questionOverrideMatch = pathname.match(/^\/api\/admin\/question-review\/([^/]+)\/override$/);
    if (method === 'PATCH' && questionOverrideMatch) {
      const questionId = questionOverrideMatch[1];
      const question = state.questionReviews.find((item) => item.questionId === questionId);
      if (!question) return fulfillJson(route, { error: 'Question not found' }, 404);
      const body = readBody<{
        expectedVersion: number;
        expectedDraftVersion: number;
        content?: string;
        answerRaw?: string;
        analyzeRaw?: string | null;
        optionContentOverrides?: Array<{ optionId: string; content: string }>;
        note?: string;
      }>(route);
      if (body.expectedVersion !== question.overrideVersion) {
        return fulfillJson(route, { error: 'Question override version conflict' }, 409);
      }
      const active = question.workflow?.activeRevision;
      if ((active?.version ?? 0) !== body.expectedDraftVersion) {
        return fulfillJson(route, { error: 'Question override draft version conflict' }, 409);
      }
      if (active?.status === 'pending_review') {
        return fulfillJson(route, { error: 'Question override revision is not editable' }, 409);
      }
      const optionOverrides = new Map(
        active?.optionContentOverrides.map((option) => [option.optionId, option.content])
        ?? question.options.filter((option) => option.overrideContent).map((option) => [option.id, option.overrideContent as string]),
      );
      for (const override of body.optionContentOverrides ?? []) optionOverrides.set(override.optionId, override.content);
      const revision: AdminQuestionOverrideRevisionV1 = {
        id: active?.id ?? '77777777-7777-4777-8777-100000000001',
        questionId,
        version: (active?.version ?? 0) + 1,
        baseVersion: question.overrideVersion,
        status: 'draft',
        contentOverride: body.content ?? active?.contentOverride ?? question.override?.contentOverride ?? null,
        answerRawOverride: body.answerRaw ?? active?.answerRawOverride ?? question.override?.answerRawOverride ?? null,
        analyzeRawOverride: body.analyzeRaw ?? active?.analyzeRawOverride ?? question.override?.analyzeRawOverride ?? null,
        optionContentOverrides: [...optionOverrides].map(([optionId, content]) => ({ optionId, content })),
        note: body.note ?? '',
        diff: [
          ...(body.content !== undefined && body.content !== question.content
            ? [{ field: 'content', label: '题干', before: question.content, after: body.content }]
            : []),
          ...(body.optionContentOverrides ?? []).map((option) => ({
            field: `option:${option.optionId}`,
            label: `选项 ${question.options.find((candidate) => candidate.id === option.optionId)?.sort ?? '-'}`,
            before: question.options.find((candidate) => candidate.id === option.optionId)?.effectiveContent ?? null,
            after: option.content,
          })),
        ],
        createdBy: active?.createdBy ?? { id: adminId, displayName: '平台管理员' },
        createdAt: active?.createdAt ?? '2026-07-15T11:00:00.000Z',
        updatedAt: '2026-07-15T11:00:00.000Z',
        submittedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: '',
        appliedVersion: null,
        rollbackFromRevisionId: null,
      };
      question.workflow = {
        activeRevision: revision,
        revisions: [revision, ...(question.workflow?.revisions.filter((item) => item.id !== revision.id) ?? [])],
      };
      return fulfillJson(route, { question });
    }

    const questionOverrideActionMatch = pathname.match(/^\/api\/admin\/question-review\/([^/]+)\/override\/(submit|approve|reject|rollback)$/);
    if (method === 'POST' && questionOverrideActionMatch) {
      const [, questionId, action] = questionOverrideActionMatch;
      const question = state.questionReviews.find((item) => item.questionId === questionId);
      if (!question) return fulfillJson(route, { error: 'Question not found' }, 404);
      const body = readBody<{
        revisionId: string;
        expectedDraftVersion?: number;
        expectedVersion?: number;
        reviewNote?: string;
        note?: string;
      }>(route);
      const revision = question.workflow?.revisions.find((item) => item.id === body.revisionId);
      if (!revision) return fulfillJson(route, { error: 'Question override revision not found' }, 404);

      if (action === 'submit') {
        revision.status = 'pending_review';
        revision.submittedAt = '2026-07-15T11:01:00.000Z';
        revision.updatedAt = revision.submittedAt;
        question.workflow = { activeRevision: revision, revisions: question.workflow?.revisions ?? [] };
      } else if (action === 'approve') {
        applyMockRevision(question, revision, body.reviewNote ?? '');
      } else if (action === 'reject') {
        revision.status = 'rejected';
        revision.reviewedBy = { id: adminId, displayName: '平台管理员' };
        revision.reviewedAt = '2026-07-15T11:02:00.000Z';
        revision.reviewNote = body.reviewNote ?? '';
        question.workflow = { activeRevision: null, revisions: question.workflow?.revisions ?? [] };
      } else {
        const rollback: AdminQuestionOverrideRevisionV1 = {
          ...structuredClone(revision),
          id: '77777777-7777-4777-8777-100000000002',
          version: 1,
          baseVersion: question.overrideVersion,
          status: 'approved',
          note: body.note ?? 'rollback',
          reviewNote: body.note ?? 'rollback',
          appliedVersion: question.overrideVersion + 1,
          rollbackFromRevisionId: revision.id,
          createdAt: '2026-07-15T11:03:00.000Z',
          updatedAt: '2026-07-15T11:03:00.000Z',
          reviewedAt: '2026-07-15T11:03:00.000Z',
        };
        applyMockRevision(question, rollback, rollback.reviewNote);
        question.workflow = {
          activeRevision: null,
          revisions: [rollback, ...(question.workflow?.revisions ?? [])],
        };
      }
      return fulfillJson(route, { question });
    }

    const questionReviewMatch = pathname.match(/^\/api\/admin\/question-review\/([^/]+)$/);
    if (method === 'GET' && questionReviewMatch) {
      const questionId = questionReviewMatch[1];
      const question = state.questionReviews.find((item) => item.questionId === questionId);
      if (!question) return fulfillJson(route, { error: 'Question not found' }, 404);
      return fulfillJson(route, { question });
    }

    if (method === 'PATCH' && questionReviewMatch) {
      const questionId = questionReviewMatch[1];
      const question = state.questionReviews.find((item) => item.questionId === questionId);
      if (!question) return fulfillJson(route, { error: 'Question not found' }, 404);
      const body = readBody<{
        addFlags?: Array<Pick<AdminQuestionReviewFlagV1, 'type' | 'severity' | 'note'>>;
        resolveFlagIds?: string[];
        ignoredFlagIds?: string[];
        excludedFromPractice?: boolean;
      }>(route);
      for (const flagId of body.resolveFlagIds ?? []) {
        const flag = question.flags.find((item) => item.id === flagId);
        if (!flag) return fulfillJson(route, { error: 'Question review flag not found' }, 404);
        flag.status = 'resolved';
        flag.resolvedAt = '2026-07-15T10:55:00.000Z';
        flag.resolvedBy = { id: adminId, displayName: '平台管理员' };
      }
      for (const flagId of body.ignoredFlagIds ?? []) {
        const flag = question.flags.find((item) => item.id === flagId);
        if (!flag) return fulfillJson(route, { error: 'Question review flag not found' }, 404);
        flag.status = 'ignored';
        flag.resolvedAt = '2026-07-15T10:56:00.000Z';
        flag.resolvedBy = { id: adminId, displayName: '平台管理员' };
      }
      for (const flag of body.addFlags ?? []) {
        question.flags.unshift(buildQuestionReviewFlag({
          id: nextQuestionFlagId(question.flags.length + 1),
          type: flag.type,
          severity: flag.severity,
          note: flag.note,
        }));
      }
      if (body.excludedFromPractice !== undefined) {
        question.excludedFromPractice = body.excludedFromPractice;
      }
      return fulfillJson(route, { question });
    }

    if (method === 'GET' && pathname === '/api/admin/audit-logs') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const result = url.searchParams.get('result');
      const action = url.searchParams.get('action')?.toLowerCase() ?? '';
      const resourceType = url.searchParams.get('resourceType')?.toLowerCase() ?? '';
      const resourceId = url.searchParams.get('resourceId')?.toLowerCase() ?? '';
      const actorAdminId = url.searchParams.get('actorAdminId');
      const filtered = state.auditLogs.filter((entry) => {
        if (result && entry.result !== result) return false;
        if (action && !entry.action.toLowerCase().includes(action)) return false;
        if (resourceType && entry.resourceType.toLowerCase() !== resourceType) return false;
        if (resourceId && !entry.resourceId.toLowerCase().includes(resourceId)) return false;
        if (actorAdminId && entry.actor?.id !== actorAdminId) return false;
        return true;
      });
      const pageItems = filtered.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        auditLogs: pageItems.slice(0, limit),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }

    if (method === 'GET' && pathname === '/api/admin/users') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const status = url.searchParams.get('status');
      const role = url.searchParams.get('role');
      const keyword = url.searchParams.get('keyword')?.toLowerCase() ?? '';
      const filtered = state.adminUsers.filter((adminUser) => {
        if (status && adminUser.status !== status) return false;
        if (role && !adminUser.roles.includes(role as AdminRoleV1)) return false;
        if (keyword && !`${adminUser.loginName} ${adminUser.displayName}`.toLowerCase().includes(keyword)) return false;
        return true;
      });
      const pageItems = filtered.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        adminUsers: pageItems.slice(0, limit),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }

    if (method === 'POST' && pathname === '/api/admin/users') {
      const body = readBody<{
        loginName: string;
        displayName: string;
        password: string;
        roles: AdminRoleV1[];
      }>(route);
      if (state.adminUsers.some((adminUser) => adminUser.loginName === body.loginName)) {
        return fulfillJson(route, { error: 'Admin loginName already exists' }, 409);
      }
      const adminUser = buildAdminUser({
        id: nextAdminUserId(state.adminUsers.length + 1),
        loginName: body.loginName,
        displayName: body.displayName,
        roles: body.roles,
      });
      state.adminUsers.unshift(adminUser);
      state.auditLogs.unshift(buildAuditLog({
        id: nextAuditLogId(state.auditLogs.length + 1),
        action: 'admin_user.create',
        resourceType: 'admin_user',
        resourceId: adminUser.id,
        before: null,
        after: { loginName: adminUser.loginName, displayName: adminUser.displayName, roles: adminUser.roles },
        metadata: { passwordSet: Boolean(body.password) },
      }));
      return fulfillJson(route, { adminUser });
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch) {
      const targetAdminId = adminUserMatch[1];
      const adminUser = state.adminUsers.find((item) => item.id === targetAdminId);
      if (!adminUser) return fulfillJson(route, { error: 'Admin user not found' }, 404);

      if (method === 'GET') {
        return fulfillJson(route, { adminUser });
      }

      if (method === 'PATCH') {
        const body = readBody<{
          displayName?: string;
          status?: AdminManagedUserV1['status'];
          roles?: AdminRoleV1[];
          password?: string;
        }>(route);
        const before = {
          displayName: adminUser.displayName,
          status: adminUser.status,
          roles: [...adminUser.roles],
        };
        if (body.displayName !== undefined) adminUser.displayName = body.displayName;
        if (body.status !== undefined) adminUser.status = body.status;
        if (body.roles !== undefined) {
          adminUser.roles = [...body.roles];
          adminUser.permissions = permissionsForMockRoles(adminUser.roles);
        }
        adminUser.updatedAt = '2026-07-15T11:10:00.000Z';
        state.auditLogs.unshift(buildAuditLog({
          id: nextAuditLogId(state.auditLogs.length + 1),
          action: 'admin_user.update',
          resourceType: 'admin_user',
          resourceId: adminUser.id,
          before,
          after: {
            displayName: adminUser.displayName,
            status: adminUser.status,
            roles: adminUser.roles,
          },
          metadata: { passwordChanged: Boolean(body.password) },
        }));
        return fulfillJson(route, { adminUser });
      }
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
      if (body.sourceDir.toLowerCase().includes('forbidden')) {
        return fulfillJson(route, { error: 'Import source directory is not allowed' }, 403);
      }
      const job = buildImportJob({
        id: nextImportJobId(state.importJobs.length + 1),
        mode: body.mode,
        status: 'succeeded',
        sourceDir: body.sourceDir,
        options: body.options,
      });
      state.importJobs.unshift(job);
      return fulfillJson(route, { job });
    }

    const importJobCancelMatch = pathname.match(/^\/api\/admin\/import-jobs\/([^/]+)\/cancel$/);
    if (method === 'POST' && importJobCancelMatch) {
      const jobId = importJobCancelMatch[1];
      const job = state.importJobs.find((item) => item.id === jobId);
      if (!job) return fulfillJson(route, { error: 'Import job not found' }, 404);
      if (job.status !== 'queued' && job.status !== 'running' && job.status !== 'cancelled') {
        return fulfillJson(route, { error: 'Import job cannot be cancelled' }, 409);
      }
      job.status = 'cancelled';
      job.progress = { ...job.progress, phase: 'cancelled' };
      job.finishedAt = '2026-07-15T10:03:00.000Z';
      return fulfillJson(route, { job });
    }

    const importJobRetryMatch = pathname.match(/^\/api\/admin\/import-jobs\/([^/]+)\/retry$/);
    if (method === 'POST' && importJobRetryMatch) {
      const jobId = importJobRetryMatch[1];
      const job = state.importJobs.find((item) => item.id === jobId);
      if (!job) return fulfillJson(route, { error: 'Import job not found' }, 404);
      if (job.status !== 'failed' && job.status !== 'cancelled') {
        return fulfillJson(route, { error: 'Import job cannot be retried' }, 409);
      }
      const retried = buildImportJob({
        id: nextImportJobId(state.importJobs.length + 1),
        mode: job.mode,
        status: 'succeeded',
        sourceDir: job.sourceDir,
        options: job.options,
      });
      state.importJobs.unshift(retried);
      return fulfillJson(route, { job: retried });
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
  mode?: AdminImportJobV1['mode'];
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
    mode: input.mode ?? 'dry_run',
    status: input.status,
    sourceDir: input.sourceDir,
    options: input.options ?? {
      batchSize: 1000,
      resetBeforeImport: false,
      generateMappings: true,
    },
    progress: input.status === 'failed'
      ? { phase: 'failed', current: 0, total: 0 }
      : input.status === 'cancelled'
        ? { phase: 'cancelled', current: 0, total: 0 }
        : { phase: input.status === 'running' ? 'running' : 'done', current: questions, total: questions },
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

function buildQuestionReview(input: {
  questionId: string;
  bankId: string;
  bankName: string;
  questionType: string;
  excludedFromPractice: boolean;
  flags: AdminQuestionReviewFlagV1[];
}): AdminQuestionReviewDetailV1 {
  return {
    questionId: input.questionId,
    bankId: input.bankId,
    bankName: input.bankName,
    questionType: input.questionType,
    contentPreview: '1 + 1 的正确答案是什么？',
    optionCount: 4,
    answerPreview: 'B',
    flags: input.flags,
    excludedFromPractice: input.excludedFromPractice,
    content: '1 + 1 的正确答案是什么？',
    answerRaw: 'B',
    analyzeRaw: '基础加法题。',
    source: {
      content: '1 + 1 的正确答案是什么？',
      answerRaw: 'B',
      analyzeRaw: '基础加法题。',
    },
    options: [
      {
        id: '77777777-7777-4777-8777-000000000001',
        sort: 1,
        content: '1',
        overrideContent: null,
        effectiveContent: '1',
      },
      {
        id: '77777777-7777-4777-8777-000000000002',
        sort: 2,
        content: '2',
        overrideContent: null,
        effectiveContent: '2',
      },
      {
        id: '77777777-7777-4777-8777-000000000003',
        sort: 3,
        content: '3',
        overrideContent: null,
        effectiveContent: '3',
      },
      {
        id: '77777777-7777-4777-8777-000000000004',
        sort: 4,
        content: '4',
        overrideContent: null,
        effectiveContent: '4',
      },
    ],
    override: null,
    overrideVersion: 0,
    workflow: {
      activeRevision: null,
      revisions: [],
    },
  };
}

function applyMockRevision(
  question: AdminQuestionReviewDetailV1,
  revision: AdminQuestionOverrideRevisionV1,
  reviewNote: string,
) {
  const source = question.source ?? {
    content: question.content,
    answerRaw: question.answerRaw,
    analyzeRaw: question.analyzeRaw,
  };
  const optionOverrides = new Map(revision.optionContentOverrides.map((option) => [option.optionId, option.content]));
  question.overrideVersion += 1;
  question.content = revision.contentOverride ?? source.content;
  question.answerRaw = revision.answerRawOverride ?? source.answerRaw;
  question.analyzeRaw = revision.analyzeRawOverride ?? source.analyzeRaw;
  question.contentPreview = preview(question.content, 160);
  question.answerPreview = preview(question.answerRaw, 120);
  question.options = question.options.map((option) => ({
    ...option,
    overrideContent: optionOverrides.get(option.id) ?? null,
    effectiveContent: optionOverrides.get(option.id) ?? option.content,
  }));
  question.override = {
    version: question.overrideVersion,
    contentOverride: revision.contentOverride,
    answerRawOverride: revision.answerRawOverride,
    analyzeRawOverride: revision.analyzeRawOverride,
    note: revision.note,
    updatedBy: { id: adminId, displayName: '平台管理员' },
    updatedAt: '2026-07-15T11:02:00.000Z',
  };
  revision.status = 'approved';
  revision.reviewedBy = { id: adminId, displayName: '平台管理员' };
  revision.reviewedAt = '2026-07-15T11:02:00.000Z';
  revision.reviewNote = reviewNote;
  revision.appliedVersion = question.overrideVersion;
  question.workflow = {
    activeRevision: null,
    revisions: question.workflow?.revisions ?? [revision],
  };
}

function toQuestionReviewItem(question: AdminQuestionReviewDetailV1): AdminQuestionReviewItemV1 {
  return {
    questionId: question.questionId,
    bankId: question.bankId,
    bankName: question.bankName,
    questionType: question.questionType,
    contentPreview: question.contentPreview,
    optionCount: question.optionCount,
    answerPreview: question.answerPreview,
    flags: question.flags,
    excludedFromPractice: question.excludedFromPractice,
  };
}

function buildQuestionReviewFlag(input: {
  id: string;
  type: AdminQuestionReviewFlagV1['type'];
  severity: AdminQuestionReviewFlagV1['severity'];
  note: string;
}): AdminQuestionReviewFlagV1 {
  return {
    id: input.id,
    type: input.type,
    severity: input.severity,
    status: 'open',
    note: input.note,
    createdAt: now,
    createdBy: { id: adminId, displayName: '平台管理员' },
    resolvedAt: null,
    resolvedBy: null,
  };
}

function preview(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function buildAuditLog(input: {
  id: string;
  actor?: AdminAuditLogEntryV1['actor'];
  action: string;
  resourceType: string;
  resourceId: string;
  before: unknown;
  after: unknown;
  metadata: Record<string, unknown>;
  result?: AdminAuditLogEntryV1['result'];
}): AdminAuditLogEntryV1 {
  return {
    id: input.id,
    actor: input.actor === undefined
      ? { id: adminId, loginName: 'admin', displayName: '平台管理员' }
      : input.actor,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    before: input.before,
    after: input.after,
    metadata: input.metadata,
    result: input.result ?? 'success',
    createdAt: now,
  };
}

function buildAdminUser(input: {
  id: string;
  loginName: string;
  displayName: string;
  roles: AdminRoleV1[];
  lastLoginAt?: string | null;
}): AdminManagedUserV1 {
  const roles = [...new Set(input.roles)].sort();
  return {
    id: input.id,
    loginName: input.loginName,
    displayName: input.displayName,
    status: 'active',
    roles,
    permissions: permissionsForMockRoles(roles),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: input.lastLoginAt ?? null,
  };
}

function permissionsForMockRoles(roles: readonly AdminRoleV1[]) {
  const permissionSet = new Set<AdminPermissionV1>();
  for (const role of roles) {
    if (role === 'super_admin') {
      for (const permission of allAdminPermissions) permissionSet.add(permission);
      continue;
    }
    if (role === 'operator') {
      for (const permission of [
        'admin:self:read',
        'bank_mapping:read',
        'import_job:read',
        'import_job:create',
        'system_status:read',
        'student_account:read',
        'student_account:write',
        'student_account:reset_password',
        'student_account:revoke_session',
      ] as const) {
        permissionSet.add(permission);
      }
      continue;
    }
    for (const permission of [
      'admin:self:read',
      'bank_mapping:read',
      'bank_mapping:write',
      'bank_mapping:publish',
      'question_review:read',
      'question_review:write',
    ] as const) {
      permissionSet.add(permission);
    }
  }

  return allAdminPermissions.filter((permission) => permissionSet.has(permission));
}

function nextAdminUserId(index: number) {
  return `dddddddd-dddd-4ddd-8ddd-${String(index).padStart(12, '0')}`;
}

function nextAuditLogId(index: number) {
  return `eeeeeeee-eeee-4eee-8eee-${String(index).padStart(12, '0')}`;
}

function nextStudentId(index: number) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
}

function nextImportJobId(index: number) {
  return `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`;
}

function nextQuestionFlagId(index: number) {
  return `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, '0')}`;
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
