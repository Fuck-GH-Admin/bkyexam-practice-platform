import type { FastifyInstance } from 'fastify';
import {
  AdminQuestionReviewDetailResponseV1Schema,
  AdminQuestionReviewListResponseV1Schema,
  ApiErrorResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  ListAdminQuestionReviewsRequestV1Schema,
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
