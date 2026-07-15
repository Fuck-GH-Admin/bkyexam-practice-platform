import { describe, expect, it } from 'vitest';
import type { AdminQuestionReviewRepository } from '../../src/admin/questionReview';
import { createMemoryAdminQuestionReviewRepository } from '../../src/admin/questionReview';
import { createAuditService, createMemoryAuditLogRepository } from '../../src/admin/audit';
import { createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';
import type { AdminQuestionReviewDetailV1, AdminQuestionReviewItemV1 } from '@bkyexam-practice/shared';

const adminId = '50000000-0000-4000-8000-000000000001';
const bankId = '10000000-0000-4000-8000-000000000001';
const questionId = '20000000-0000-4000-8000-000000000001';
const optionId = '30000000-0000-4000-8000-000000000001';
const flagId = '70000000-0000-4000-8000-000000000001';

const questionReview: AdminQuestionReviewItemV1 = {
  questionId,
  bankId,
  bankName: '数据库集成测试题库',
  questionType: 'single_choice',
  contentPreview: 'PostgreSQL 中哪个命令用于提交当前事务？',
  optionCount: 2,
  answerPreview: 'COMMIT',
  flags: [{
    id: flagId,
    type: 'bad_answer',
    severity: 'high',
    status: 'open',
    note: '答案与解析不一致',
    createdAt: '2026-07-13T10:00:00.000Z',
    createdBy: { id: adminId, displayName: 'Operator' },
    resolvedAt: null,
    resolvedBy: null,
  }],
  excludedFromPractice: false,
};

const questionReviewDetail: AdminQuestionReviewDetailV1 = {
  ...questionReview,
  content: 'PostgreSQL 中哪个命令用于提交当前事务？',
  answerRaw: 'COMMIT',
  analyzeRaw: 'COMMIT 会提交当前事务。',
  options: [{
    id: optionId,
    sort: 1,
    content: 'COMMIT',
    overrideContent: null,
    effectiveContent: 'COMMIT',
  }],
  override: null,
  overrideVersion: 0,
};

async function adminAuthRepository(roles: Array<'content_editor' | 'operator' | 'super_admin'> = ['content_editor']) {
  return createMemoryAdminAuthRepository([{
    id: adminId,
    loginName: 'operator@example.com',
    displayName: 'Operator',
    passwordHash: await hashPassword('secret'),
    status: 'active',
    roles,
  }]);
}

async function loginAdmin(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { loginName: 'operator@example.com', password: 'secret' },
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers['set-cookie']).split(';', 1)[0];
}

describe('admin question review routes', () => {
  it('requires an admin session before listing question reviews', async () => {
    const app = buildApp({
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReview]),
    });

    const response = await app.inject({ method: 'GET', url: '/api/admin/question-review' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('lists question reviews with filters and pagination', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReview]),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/question-review?bankId=${bankId}&flagType=bad_answer&severity=high&keyword=PostgreSQL&limit=10&offset=0`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      questions: [questionReview],
      page: { limit: 10, offset: 0, hasMore: false },
    });
  });

  it('loads question detail and saves override edits with audit logs', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReviewDetail]),
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/admin/question-review/${questionId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      question: {
        questionId,
        content: 'PostgreSQL 中哪个命令用于提交当前事务？',
        answerRaw: 'COMMIT',
        options: [{ id: optionId, effectiveContent: 'COMMIT' }],
        overrideVersion: 0,
      },
    });

    const override = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        content: 'PostgreSQL 中 COMMIT 用于提交当前事务。',
        answerRaw: 'COMMIT',
        optionContentOverrides: [{ optionId, content: 'COMMIT 命令' }],
        note: 'Integration override',
      },
    });
    expect(override.statusCode).toBe(200);
    expect(override.json()).toMatchObject({
      question: {
        questionId,
        content: 'PostgreSQL 中 COMMIT 用于提交当前事务。',
        answerRaw: 'COMMIT',
        options: [{ id: optionId, overrideContent: 'COMMIT 命令', effectiveContent: 'COMMIT 命令' }],
        overrideVersion: 1,
        override: { version: 1, note: 'Integration override' },
      },
    });
    expect(auditLogRepository.entries.filter((entry) => entry.action === 'question_review.override_update')).toHaveLength(1);

    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        content: 'stale edit',
      },
    });
    expect(conflict.statusCode).toBe(409);
  });

  it('adds flags, resolves flags, updates exclusion, and writes audit logs', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReview]),
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}`,
      headers: { cookie },
      payload: {
        addFlags: [{ type: 'missing_option', severity: 'blocking', note: '缺少选项' }],
        resolveFlagIds: [flagId],
        excludedFromPractice: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      question: {
        questionId,
        bankId,
        excludedFromPractice: true,
        flags: expect.arrayContaining([
          expect.objectContaining({ id: flagId, status: 'resolved' }),
          expect.objectContaining({ type: 'missing_option', severity: 'blocking', status: 'open' }),
        ]),
      },
    });

    expect(auditLogRepository.entries.filter((entry) => entry.action === 'question_review.flag_add')).toHaveLength(1);
    expect(auditLogRepository.entries.filter((entry) => entry.action === 'question_review.flag_resolve')).toHaveLength(1);
    expect(auditLogRepository.entries.filter((entry) => entry.action === 'question_review.exclude_update')).toHaveLength(1);
  });

  it('returns 400/403/404 for invalid requests, missing permissions, and missing flags', async () => {
    const forbiddenApp = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReview]),
    });
    const forbiddenCookie = await loginAdmin(forbiddenApp);
    const forbidden = await forbiddenApp.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}`,
      headers: { cookie: forbiddenCookie },
      payload: { excludedFromPractice: true },
    });
    expect(forbidden.statusCode).toBe(403);

    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReview]),
    });
    const cookie = await loginAdmin(app);

    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/admin/question-review/not-a-uuid',
      headers: { cookie },
      payload: { excludedFromPractice: true },
    });
    expect(invalid.statusCode).toBe(400);

    const missingFlag = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}`,
      headers: { cookie },
      payload: { resolveFlagIds: ['70000000-0000-4000-8000-000000000099'] },
    });
    expect(missingFlag.statusCode).toBe(404);
    expect(missingFlag.json()).toEqual({ error: 'Question review flag not found' });
  });

  it('fails closed when a repository returns an invalid question review payload', async () => {
    const repository: AdminQuestionReviewRepository = {
      async listQuestionReviews(filters) {
        return {
          questions: [{ ...questionReview, flags: [{ ...questionReview.flags[0], severity: 'fatal' }] } as never],
          page: { limit: filters.limit, offset: filters.offset, hasMore: false },
        };
      },
      async updateQuestionReview() {
        return { status: 'question_not_found' };
      },
      async getQuestionReview() {
        return null;
      },
      async updateQuestionOverride() {
        return { status: 'question_not_found' };
      },
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminQuestionReviewRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/question-review',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(500);
  });
});
