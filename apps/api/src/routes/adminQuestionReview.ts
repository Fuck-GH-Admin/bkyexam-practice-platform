import type { FastifyInstance } from 'fastify';
import {
  AdminQuestionOverrideResponseV1Schema,
  AdminQuestionReviewDetailResponseV1Schema,
  AdminQuestionReviewListResponseV1Schema,
  ApiErrorResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  ListAdminQuestionReviewsRequestV1Schema,
  ReviewAdminQuestionOverrideRequestV1Schema,
  RollbackAdminQuestionOverrideRequestV1Schema,
  SubmitAdminQuestionOverrideRequestV1Schema,
  UpdateAdminQuestionOverrideRequestV1Schema,
  UpdateAdminQuestionReviewRequestV1Schema,
  type AdminPermissionV1,
} from '@bkyexam-practice/shared';
import {
  createAuditService,
  createMemoryAuditLogRepository,
  type AuditService,
} from '../admin/audit.js';
import {
  createMemoryAdminQuestionReviewRepository,
  type AdminQuestionReviewRepository,
} from '../admin/questionReview.js';
import { hasAdminPermission } from '../admin/rbac.js';
import {
  createAdminSessionService,
  createMemoryAdminSessionRepository,
  type ResolvedAdminSession,
} from '../admin/session.js';
import { adminSessionCookieName } from './adminAuth.js';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

interface AdminQuestionReviewRoutesOptions {
  repository?: AdminQuestionReviewRepository;
  sessionService?: AdminSessionService;
  auditService?: AuditService;
}

function errorResponse(error: string) {
  return ApiErrorResponseV1Schema.parse({ error });
}

function requireAdminPermission(
  session: ResolvedAdminSession | null,
  permission: AdminPermissionV1,
): { ok: true; session: ResolvedAdminSession } | { ok: false; statusCode: 401 | 403; error: string } {
  if (!session) {
    return { ok: false, statusCode: 401, error: 'Unauthenticated' };
  }

  if (!hasAdminPermission(session.admin, permission)) {
    return { ok: false, statusCode: 403, error: 'Forbidden' };
  }

  return { ok: true, session };
}

export function createAdminQuestionReviewRoutes(options: AdminQuestionReviewRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAdminQuestionReviewRepository();
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });
  const auditService = options.auditService ?? createAuditService(createMemoryAuditLogRepository());

  return async function registerAdminQuestionReviewRoutes(app: FastifyInstance) {
    app.get('/api/admin/question-review', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedQuery = ListAdminQuestionReviewsRequestV1Schema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send(errorResponse('Invalid question review query'));
      }

      const page = await repository.listQuestionReviews(parsedQuery.data);
      return AdminQuestionReviewListResponseV1Schema.parse(page);
    });

    app.get('/api/admin/question-review/:questionId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { questionId?: unknown };
      const parsedQuestionId = CaseInsensitiveUuidV1Schema.safeParse(params.questionId);
      if (!parsedQuestionId.success) {
        return reply.status(400).send(errorResponse('Invalid question id'));
      }

      const question = await repository.getQuestionReview(parsedQuestionId.data.toLocaleLowerCase());
      if (!question) {
        return reply.status(404).send(errorResponse('Question not found'));
      }

      return AdminQuestionReviewDetailResponseV1Schema.parse({ question });
    });

    app.patch('/api/admin/question-review/:questionId/override', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:write');
      if (!required.ok) {
        await recordQuestionReviewFailure(auditService, {
          session,
          action: 'question_review.override_draft_save',
          questionId: parseQuestionId(request.params) ?? 'unknown',
          statusCode: required.statusCode,
          error: required.error,
        });
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { questionId?: unknown };
      const parsedQuestionId = CaseInsensitiveUuidV1Schema.safeParse(params.questionId);
      if (!parsedQuestionId.success) {
        return reply.status(400).send(errorResponse('Invalid question id'));
      }

      const parsedBody = UpdateAdminQuestionOverrideRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid question override update request'));
      }

      const result = await repository.updateQuestionOverride({
        questionId: parsedQuestionId.data.toLocaleLowerCase(),
        changes: parsedBody.data,
        actor: {
          id: required.session.admin.id,
          displayName: required.session.admin.displayName,
        },
      });

      const updateFailure = overrideUpdateFailure(result);
      if (updateFailure) {
        await recordQuestionReviewFailure(auditService, {
          session: required.session,
          action: 'question_review.override_draft_save',
          questionId: parsedQuestionId.data.toLocaleLowerCase(),
          statusCode: updateFailure.statusCode,
          error: updateFailure.error,
        });
        return reply.status(updateFailure.statusCode).send(errorResponse(updateFailure.error));
      }
      if (result.status !== 'updated') {
        throw new Error('Unreachable question override update result');
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'question_review.override_draft_save',
        resourceType: 'question_override_revision',
        resourceId: result.revision.id,
        before: {
          effectiveVersion: result.before.overrideVersion,
          draftVersion: parsedBody.data.expectedDraftVersion,
        },
        after: {
          revisionStatus: result.revision.status,
          revisionVersion: result.revision.version,
          diffCount: result.revision.diff.length,
        },
        metadata: {
          questionId: result.after.questionId,
          bankId: result.after.bankId,
          changedOptionCount: parsedBody.data.optionContentOverrides.length,
          note: parsedBody.data.note,
        },
        result: 'success',
      });

      return AdminQuestionOverrideResponseV1Schema.parse({ question: result.after });
    });

    app.post('/api/admin/question-review/:questionId/override/submit', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:write');
      if (!required.ok) {
        await recordQuestionReviewFailure(auditService, {
          session,
          action: 'question_review.override_submit',
          questionId: parseQuestionId(request.params) ?? 'unknown',
          statusCode: required.statusCode,
          error: required.error,
        });
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }
      const parsedQuestionId = parseQuestionId(request.params);
      if (!parsedQuestionId) return reply.status(400).send(errorResponse('Invalid question id'));
      const parsedBody = SubmitAdminQuestionOverrideRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid question override submit request'));
      }

      const result = await repository.submitQuestionOverride({
        questionId: parsedQuestionId,
        request: parsedBody.data,
        actor: toActor(required.session),
      });
      const failure = workflowFailure(result);
      if (failure) {
        await recordQuestionReviewFailure(auditService, {
          session: required.session,
          action: 'question_review.override_submit',
          questionId: parsedQuestionId,
          revisionId: parsedBody.data.revisionId,
          statusCode: failure.statusCode,
          error: failure.error,
        });
        return reply.status(failure.statusCode).send(errorResponse(failure.error));
      }
      if (result.status !== 'updated') throw new Error('Unreachable question override submit result');

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'question_review.override_submit',
        resourceType: 'question_override_revision',
        resourceId: result.revision.id,
        before: { status: 'draft', version: parsedBody.data.expectedDraftVersion },
        after: { status: result.revision.status, version: result.revision.version },
        metadata: { questionId: result.after.questionId, diffCount: result.revision.diff.length },
        result: 'success',
      });
      return AdminQuestionOverrideResponseV1Schema.parse({ question: result.after });
    });

    app.post('/api/admin/question-review/:questionId/override/approve', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:approve');
      if (!required.ok) {
        await recordQuestionReviewFailure(auditService, {
          session,
          action: 'question_review.override_approve',
          questionId: parseQuestionId(request.params) ?? 'unknown',
          statusCode: required.statusCode,
          error: required.error,
        });
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }
      const parsedQuestionId = parseQuestionId(request.params);
      if (!parsedQuestionId) return reply.status(400).send(errorResponse('Invalid question id'));
      const parsedBody = ReviewAdminQuestionOverrideRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid question override approval request'));
      }
      const result = await repository.approveQuestionOverride({
        questionId: parsedQuestionId,
        request: parsedBody.data,
        actor: toActor(required.session),
      });
      const failure = workflowFailure(result);
      if (failure) {
        await recordQuestionReviewFailure(auditService, {
          session: required.session,
          action: 'question_review.override_approve',
          questionId: parsedQuestionId,
          revisionId: parsedBody.data.revisionId,
          statusCode: failure.statusCode,
          error: failure.error,
        });
        return reply.status(failure.statusCode).send(errorResponse(failure.error));
      }
      if (result.status !== 'updated') throw new Error('Unreachable question override approval result');

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'question_review.override_approve',
        resourceType: 'question_override_revision',
        resourceId: result.revision.id,
        before: { effectiveVersion: result.before.overrideVersion, status: 'pending_review' },
        after: { effectiveVersion: result.after.overrideVersion, status: result.revision.status },
        metadata: {
          questionId: result.after.questionId,
          reviewNote: parsedBody.data.reviewNote,
          diffCount: result.revision.diff.length,
        },
        result: 'success',
      });
      return AdminQuestionOverrideResponseV1Schema.parse({ question: result.after });
    });

    app.post('/api/admin/question-review/:questionId/override/reject', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:approve');
      if (!required.ok) {
        await recordQuestionReviewFailure(auditService, {
          session,
          action: 'question_review.override_reject',
          questionId: parseQuestionId(request.params) ?? 'unknown',
          statusCode: required.statusCode,
          error: required.error,
        });
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }
      const parsedQuestionId = parseQuestionId(request.params);
      if (!parsedQuestionId) return reply.status(400).send(errorResponse('Invalid question id'));
      const parsedBody = ReviewAdminQuestionOverrideRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid question override rejection request'));
      }
      const result = await repository.rejectQuestionOverride({
        questionId: parsedQuestionId,
        request: parsedBody.data,
        actor: toActor(required.session),
      });
      const failure = workflowFailure(result);
      if (failure) {
        await recordQuestionReviewFailure(auditService, {
          session: required.session,
          action: 'question_review.override_reject',
          questionId: parsedQuestionId,
          revisionId: parsedBody.data.revisionId,
          statusCode: failure.statusCode,
          error: failure.error,
        });
        return reply.status(failure.statusCode).send(errorResponse(failure.error));
      }
      if (result.status !== 'updated') throw new Error('Unreachable question override rejection result');

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'question_review.override_reject',
        resourceType: 'question_override_revision',
        resourceId: result.revision.id,
        before: { status: 'pending_review' },
        after: { status: result.revision.status },
        metadata: { questionId: result.after.questionId, reviewNote: parsedBody.data.reviewNote },
        result: 'success',
      });
      return AdminQuestionOverrideResponseV1Schema.parse({ question: result.after });
    });

    app.post('/api/admin/question-review/:questionId/override/rollback', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:approve');
      if (!required.ok) {
        await recordQuestionReviewFailure(auditService, {
          session,
          action: 'question_review.override_rollback',
          questionId: parseQuestionId(request.params) ?? 'unknown',
          statusCode: required.statusCode,
          error: required.error,
        });
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }
      const parsedQuestionId = parseQuestionId(request.params);
      if (!parsedQuestionId) return reply.status(400).send(errorResponse('Invalid question id'));
      const parsedBody = RollbackAdminQuestionOverrideRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid question override rollback request'));
      }
      const result = await repository.rollbackQuestionOverride({
        questionId: parsedQuestionId,
        request: parsedBody.data,
        actor: toActor(required.session),
      });
      const failure = workflowFailure(result);
      if (failure) {
        await recordQuestionReviewFailure(auditService, {
          session: required.session,
          action: 'question_review.override_rollback',
          questionId: parsedQuestionId,
          revisionId: parsedBody.data.revisionId,
          statusCode: failure.statusCode,
          error: failure.error,
        });
        return reply.status(failure.statusCode).send(errorResponse(failure.error));
      }
      if (result.status !== 'updated') throw new Error('Unreachable question override rollback result');

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'question_review.override_rollback',
        resourceType: 'question_override_revision',
        resourceId: result.revision.id,
        before: { effectiveVersion: result.before.overrideVersion },
        after: { effectiveVersion: result.after.overrideVersion },
        metadata: {
          questionId: result.after.questionId,
          rollbackFromRevisionId: parsedBody.data.revisionId,
          note: parsedBody.data.note,
        },
        result: 'success',
      });
      return AdminQuestionOverrideResponseV1Schema.parse({ question: result.after });
    });

    app.patch('/api/admin/question-review/:questionId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'question_review:write');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { questionId?: unknown };
      const parsedQuestionId = CaseInsensitiveUuidV1Schema.safeParse(params.questionId);
      if (!parsedQuestionId.success) {
        return reply.status(400).send(errorResponse('Invalid question id'));
      }

      const parsedBody = UpdateAdminQuestionReviewRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid question review update request'));
      }

      const result = await repository.updateQuestionReview({
        questionId: parsedQuestionId.data.toLocaleLowerCase(),
        changes: parsedBody.data,
        actor: {
          id: required.session.admin.id,
          displayName: required.session.admin.displayName,
        },
      });

      if (result.status === 'question_not_found') {
        return reply.status(404).send(errorResponse('Question not found'));
      }
      if (result.status === 'flag_not_found') {
        return reply.status(404).send(errorResponse('Question review flag not found'));
      }

      for (const flag of result.addedFlags) {
        await auditService.record({
          actorAdminId: required.session.admin.id,
          action: 'question_review.flag_add',
          resourceType: 'question_quality_flag',
          resourceId: flag.id,
          after: {
            questionId: result.after.questionId,
            type: flag.type,
            severity: flag.severity,
            status: flag.status,
            note: flag.note,
          },
          metadata: { bankId: result.after.bankId },
          result: 'success',
        });
      }

      for (const flag of [...result.resolvedFlags, ...result.ignoredFlags]) {
        await auditService.record({
          actorAdminId: required.session.admin.id,
          action: 'question_review.flag_resolve',
          resourceType: 'question_quality_flag',
          resourceId: flag.id,
          before: { status: 'open' },
          after: { status: flag.status },
          metadata: { questionId: result.after.questionId },
          result: 'success',
        });
      }

      if (result.before.excludedFromPractice !== result.after.excludedFromPractice) {
        await auditService.record({
          actorAdminId: required.session.admin.id,
          action: 'question_review.exclude_update',
          resourceType: 'question',
          resourceId: result.after.questionId,
          before: { excludedFromPractice: result.before.excludedFromPractice },
          after: { excludedFromPractice: result.after.excludedFromPractice },
          metadata: { bankId: result.after.bankId },
          result: 'success',
        });
      }

      return AdminQuestionReviewDetailResponseV1Schema.parse({ question: result.after });
    });
  };
}

function parseQuestionId(params: unknown): string | null {
  const value = (params as { questionId?: unknown }).questionId;
  const parsed = CaseInsensitiveUuidV1Schema.safeParse(value);
  return parsed.success ? parsed.data.toLocaleLowerCase() : null;
}

function toActor(session: ResolvedAdminSession) {
  return {
    id: session.admin.id,
    displayName: session.admin.displayName,
  };
}

function overrideUpdateFailure(result: Awaited<
  ReturnType<AdminQuestionReviewRepository['updateQuestionOverride']>
>): { statusCode: 404 | 409; error: string } | null {
  switch (result.status) {
    case 'question_not_found':
      return { statusCode: 404, error: 'Question not found' };
    case 'option_not_found':
      return { statusCode: 404, error: 'Question option not found' };
    case 'version_conflict':
      return { statusCode: 409, error: 'Question override version conflict' };
    case 'draft_version_conflict':
      return { statusCode: 409, error: 'Question override draft version conflict' };
    case 'revision_not_editable':
      return { statusCode: 409, error: 'Question override revision is not editable' };
    case 'updated':
      return null;
  }
}

async function recordQuestionReviewFailure(
  auditService: AuditService,
  input: {
    session: ResolvedAdminSession | null;
    action: string;
    questionId: string;
    revisionId?: string;
    statusCode: number;
    error: string;
  },
) {
  if (!input.session) return;
  await auditService.record({
    actorAdminId: input.session.admin.id,
    action: input.action,
    resourceType: input.revisionId ? 'question_override_revision' : 'question',
    resourceId: input.revisionId ?? input.questionId,
    metadata: {
      questionId: input.questionId,
      statusCode: input.statusCode,
      error: input.error,
    },
    result: 'failure',
  });
}

function workflowFailure(result: Awaited<
  ReturnType<AdminQuestionReviewRepository['submitQuestionOverride']>
>): { statusCode: 404 | 409; error: string } | null {
  switch (result.status) {
    case 'question_not_found':
      return { statusCode: 404, error: 'Question not found' };
    case 'revision_not_found':
      return { statusCode: 404, error: 'Question override revision not found' };
    case 'version_conflict':
      return { statusCode: 409, error: 'Question override version conflict' };
    case 'draft_version_conflict':
      return { statusCode: 409, error: 'Question override draft version conflict' };
    case 'revision_not_editable':
      return { statusCode: 409, error: 'Question override revision is not editable' };
    case 'no_change':
      return { statusCode: 409, error: 'Question override rollback would not change effective content' };
    case 'updated':
      return null;
  }
}
