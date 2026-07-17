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

  it('loads question detail, reviews a diff, approves it, and rolls back with audit logs', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
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
        content: 'PostgreSQL 中哪个命令用于提交当前事务？',
        answerRaw: 'COMMIT',
        options: [{ id: optionId, overrideContent: null, effectiveContent: 'COMMIT' }],
        overrideVersion: 0,
        override: null,
        workflow: {
          activeRevision: {
            status: 'draft',
            version: 1,
            baseVersion: 0,
            note: 'Integration override',
            diff: expect.arrayContaining([
              expect.objectContaining({ field: 'content' }),
              expect.objectContaining({ field: `option:${optionId}` }),
            ]),
          },
        },
      },
    });
    const revisionId = override.json().question.workflow.activeRevision.id as string;
    expect(auditLogRepository.entries.filter((entry) => entry.action === 'question_review.override_draft_save')).toHaveLength(1);

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/submit`,
      headers: { cookie },
      payload: {
        revisionId,
        expectedDraftVersion: 1,
      },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json()).toMatchObject({
      question: { workflow: { activeRevision: { id: revisionId, status: 'pending_review' } } },
    });

    const approved = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/approve`,
      headers: { cookie },
      payload: {
        revisionId,
        expectedVersion: 0,
        reviewNote: 'Verified answer and wording',
      },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      question: {
        content: 'PostgreSQL 中 COMMIT 用于提交当前事务。',
        options: [{ id: optionId, effectiveContent: 'COMMIT 命令' }],
        overrideVersion: 1,
        workflow: {
          activeRevision: null,
          revisions: [expect.objectContaining({
            id: revisionId,
            status: 'approved',
            appliedVersion: 1,
          })],
        },
      },
    });
    expect(auditLogRepository.entries.filter((entry) => entry.action === 'question_review.override_approve')).toHaveLength(1);

    const redundantRollback = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/rollback`,
      headers: { cookie },
      payload: {
        revisionId,
        expectedVersion: 1,
        note: 'Redundant rollback must be rejected',
      },
    });
    expect(redundantRollback.statusCode).toBe(409);
    expect(redundantRollback.json()).toEqual({
      error: 'Question override rollback would not change effective content',
    });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      action: 'question_review.override_rollback',
      resourceId: revisionId,
      result: 'failure',
      metadata: {
        questionId,
        statusCode: 409,
        error: 'Question override rollback would not change effective content',
      },
    });

    const secondDraft = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 1,
        expectedDraftVersion: 0,
        content: 'PostgreSQL 中 COMMIT 会永久提交当前事务。',
        answerRaw: 'COMMIT',
        optionContentOverrides: [{ optionId, content: '执行 COMMIT' }],
        note: 'Second approved revision',
      },
    });
    expect(secondDraft.statusCode).toBe(200);
    const secondRevisionId = secondDraft.json().question.workflow.activeRevision.id as string;

    const secondSubmitted = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/submit`,
      headers: { cookie },
      payload: { revisionId: secondRevisionId, expectedDraftVersion: 1 },
    });
    expect(secondSubmitted.statusCode).toBe(200);

    const secondApproved = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/approve`,
      headers: { cookie },
      payload: {
        revisionId: secondRevisionId,
        expectedVersion: 1,
        reviewNote: 'Approved second wording',
      },
    });
    expect(secondApproved.statusCode).toBe(200);
    expect(secondApproved.json()).toMatchObject({
      question: {
        content: 'PostgreSQL 中 COMMIT 会永久提交当前事务。',
        overrideVersion: 2,
      },
    });

    const rollback = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/rollback`,
      headers: { cookie },
      payload: {
        revisionId,
        expectedVersion: 2,
        note: 'Rollback to first approved revision',
      },
    });
    expect(rollback.statusCode).toBe(200);
    expect(rollback.json()).toMatchObject({
      question: {
        content: 'PostgreSQL 中 COMMIT 用于提交当前事务。',
        options: [{ id: optionId, effectiveContent: 'COMMIT 命令' }],
        overrideVersion: 3,
        workflow: {
          revisions: expect.arrayContaining([
            expect.objectContaining({
              status: 'approved',
              appliedVersion: 3,
              rollbackFromRevisionId: revisionId,
            }),
          ]),
        },
      },
    });
    expect(auditLogRepository.entries.filter((entry) => (
      entry.action === 'question_review.override_rollback' && entry.result === 'success'
    ))).toHaveLength(1);

    const postRollbackDraft = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 3,
        expectedDraftVersion: 0,
        content: '回滚后重新编辑：COMMIT 提交当前事务。',
        answerRaw: 'COMMIT',
        optionContentOverrides: [{ optionId, content: 'COMMIT（提交）' }],
        note: 'Edit after rollback',
      },
    });
    expect(postRollbackDraft.statusCode).toBe(200);
    expect(postRollbackDraft.json()).toMatchObject({
      question: {
        content: 'PostgreSQL 中 COMMIT 用于提交当前事务。',
        overrideVersion: 3,
        workflow: {
          activeRevision: {
            status: 'draft',
            baseVersion: 3,
            version: 1,
          },
        },
      },
    });
    const postRollbackRevisionId = postRollbackDraft.json().question.workflow.activeRevision.id as string;
    expect((await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/submit`,
      headers: { cookie },
      payload: { revisionId: postRollbackRevisionId, expectedDraftVersion: 1 },
    })).statusCode).toBe(200);
    const postRollbackApproved = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/approve`,
      headers: { cookie },
      payload: {
        revisionId: postRollbackRevisionId,
        expectedVersion: 3,
        reviewNote: 'Approved edit after rollback',
      },
    });
    expect(postRollbackApproved.statusCode).toBe(200);
    expect(postRollbackApproved.json()).toMatchObject({
      question: {
        content: '回滚后重新编辑：COMMIT 提交当前事务。',
        overrideVersion: 4,
      },
    });

    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        expectedDraftVersion: 0,
        content: 'stale edit',
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      action: 'question_review.override_draft_save',
      result: 'failure',
      metadata: { questionId, statusCode: 409, error: 'Question override version conflict' },
    });
  });

  it('rejects a pending revision without changing effective content and allows a new draft', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReviewDetail]),
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const draft = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        expectedDraftVersion: 0,
        content: 'This rejected draft must not become effective.',
        answerRaw: 'ROLLBACK',
        optionContentOverrides: [{ optionId, content: 'Rejected option text' }],
        note: 'Reject coverage',
      },
    });
    expect(draft.statusCode).toBe(200);
    const revisionId = draft.json().question.workflow.activeRevision.id as string;

    const submitted = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/submit`,
      headers: { cookie },
      payload: { revisionId, expectedDraftVersion: 1 },
    });
    expect(submitted.statusCode).toBe(200);

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/reject`,
      headers: { cookie },
      payload: {
        revisionId,
        expectedVersion: 0,
        reviewNote: 'Answer is incorrect',
      },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({
      question: {
        content: questionReviewDetail.content,
        answerRaw: questionReviewDetail.answerRaw,
        options: [{ id: optionId, overrideContent: null, effectiveContent: 'COMMIT' }],
        override: null,
        overrideVersion: 0,
        workflow: {
          activeRevision: null,
          revisions: [expect.objectContaining({
            id: revisionId,
            status: 'rejected',
            reviewNote: 'Answer is incorrect',
            appliedVersion: null,
          })],
        },
      },
    });
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      action: 'question_review.override_reject',
      resourceId: revisionId,
      result: 'success',
      before: { status: 'pending_review' },
      after: { status: 'rejected' },
    });

    const replacementDraft = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        expectedDraftVersion: 0,
        content: 'Replacement draft after rejection.',
        answerRaw: 'COMMIT',
        optionContentOverrides: [],
        note: 'Replacement draft',
      },
    });
    expect(replacementDraft.statusCode).toBe(200);
    expect(replacementDraft.json()).toMatchObject({
      question: {
        content: questionReviewDetail.content,
        overrideVersion: 0,
        workflow: {
          activeRevision: {
            status: 'draft',
            baseVersion: 0,
            version: 1,
          },
          revisions: expect.arrayContaining([
            expect.objectContaining({ id: revisionId, status: 'rejected' }),
          ]),
        },
      },
    });
  });

  it('returns deterministic draft/effective version conflicts and audits failed workflow attempts', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['super_admin']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReviewDetail]),
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const draft = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        expectedDraftVersion: 0,
        content: 'Concurrent draft version 1',
        answerRaw: 'COMMIT',
        optionContentOverrides: [],
        note: 'Concurrent coverage',
      },
    });
    expect(draft.statusCode).toBe(200);
    const revisionId = draft.json().question.workflow.activeRevision.id as string;

    const staleDraft = await app.inject({
      method: 'PATCH',
      url: `/api/admin/question-review/${questionId}/override`,
      headers: { cookie },
      payload: {
        expectedVersion: 0,
        expectedDraftVersion: 0,
        content: 'Stale concurrent draft',
        answerRaw: 'COMMIT',
        optionContentOverrides: [],
        note: 'Stale',
      },
    });
    expect(staleDraft.statusCode).toBe(409);
    expect(staleDraft.json()).toEqual({ error: 'Question override draft version conflict' });

    expect((await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/submit`,
      headers: { cookie },
      payload: { revisionId, expectedDraftVersion: 1 },
    })).statusCode).toBe(200);

    const staleApproval = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/approve`,
      headers: { cookie },
      payload: {
        revisionId,
        expectedVersion: 1,
        reviewNote: 'Stale effective version',
      },
    });
    expect(staleApproval.statusCode).toBe(409);
    expect(staleApproval.json()).toEqual({ error: 'Question override version conflict' });

    const missingRevision = await app.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/reject`,
      headers: { cookie },
      payload: {
        revisionId: '70000000-0000-4000-8000-000000000099',
        expectedVersion: 0,
        reviewNote: 'Missing revision',
      },
    });
    expect(missingRevision.statusCode).toBe(404);
    expect(missingRevision.json()).toEqual({ error: 'Question override revision not found' });

    expect(auditLogRepository.entries.filter((entry) => entry.result === 'failure')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'question_review.override_draft_save',
          metadata: expect.objectContaining({ statusCode: 409, error: 'Question override draft version conflict' }),
        }),
        expect.objectContaining({
          action: 'question_review.override_approve',
          resourceId: revisionId,
          metadata: expect.objectContaining({ statusCode: 409, error: 'Question override version conflict' }),
        }),
        expect.objectContaining({
          action: 'question_review.override_reject',
          resourceId: '70000000-0000-4000-8000-000000000099',
          metadata: expect.objectContaining({ statusCode: 404, error: 'Question override revision not found' }),
        }),
      ]),
    );
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
    const forbiddenAuditLogRepository = createMemoryAuditLogRepository();
    const forbiddenApp = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminQuestionReviewRepository: createMemoryAdminQuestionReviewRepository([questionReview]),
      auditService: createAuditService(forbiddenAuditLogRepository),
    });
    const forbiddenCookie = await loginAdmin(forbiddenApp);
    const forbidden = await forbiddenApp.inject({
      method: 'POST',
      url: `/api/admin/question-review/${questionId}/override/reject`,
      headers: { cookie: forbiddenCookie },
      payload: {
        revisionId: '70000000-0000-4000-8000-000000000099',
        expectedVersion: 0,
        reviewNote: 'Forbidden rejection',
      },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbiddenAuditLogRepository.entries.at(-1)).toMatchObject({
      actorAdminId: adminId,
      action: 'question_review.override_reject',
      resourceType: 'question',
      resourceId: questionId,
      result: 'failure',
      metadata: { questionId, statusCode: 403, error: 'Forbidden' },
    });

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
      async submitQuestionOverride() {
        return { status: 'question_not_found' };
      },
      async approveQuestionOverride() {
        return { status: 'question_not_found' };
      },
      async rejectQuestionOverride() {
        return { status: 'question_not_found' };
      },
      async rollbackQuestionOverride() {
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
