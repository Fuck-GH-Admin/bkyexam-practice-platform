import type { FastifyInstance } from 'fastify';
import {
  AdminBankMappingDetailResponseV1Schema,
  AdminBankMappingListResponseV1Schema,
  ApiErrorResponseV1Schema,
  BulkUpdateAdminBankMappingStatusRequestV1Schema,
  BulkUpdateAdminBankMappingStatusResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  ListAdminBankMappingsRequestV1Schema,
  UpdateAdminBankMappingRequestV1Schema,
  type AdminPermissionV1,
  type UpdateAdminBankMappingChangesV1,
} from '@bkyexam-practice/shared';
import {
  createAuditService,
  createMemoryAuditLogRepository,
  type AuditService,
} from '../admin/audit.js';
import {
  createMemoryAdminBankMappingRepository,
  type AdminBankMappingRepository,
} from '../admin/bankMappings.js';
import { hasAdminPermission } from '../admin/rbac.js';
import {
  createAdminSessionService,
  createMemoryAdminSessionRepository,
  type ResolvedAdminSession,
} from '../admin/session.js';
import { adminSessionCookieName } from './adminAuth.js';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

interface AdminBankMappingRoutesOptions {
  repository?: AdminBankMappingRepository;
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

function requiresPublishPermission(changes: UpdateAdminBankMappingChangesV1): boolean {
  return 'visible' in changes || 'status' in changes;
}

function diffForAudit(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedFields: readonly string[],
) {
  return {
    before: Object.fromEntries(changedFields.map((field) => [field, before[field]])),
    after: Object.fromEntries(changedFields.map((field) => [field, after[field]])),
  };
}

export function createAdminBankMappingRoutes(options: AdminBankMappingRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAdminBankMappingRepository();
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });
  const auditService = options.auditService ?? createAuditService(createMemoryAuditLogRepository());

  return async function registerAdminBankMappingRoutes(app: FastifyInstance) {
    app.get('/api/admin/bank-mappings', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'bank_mapping:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedQuery = ListAdminBankMappingsRequestV1Schema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send(errorResponse('Invalid bank mapping query'));
      }

      const page = await repository.listBankMappings(parsedQuery.data);
      return AdminBankMappingListResponseV1Schema.parse(page);
    });

    app.get('/api/admin/bank-mappings/:bankId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'bank_mapping:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { bankId?: unknown };
      const parsedBankId = CaseInsensitiveUuidV1Schema.safeParse(params.bankId);
      if (!parsedBankId.success) {
        return reply.status(400).send(errorResponse('Invalid bank id'));
      }

      const bankMapping = await repository.findBankMappingById(parsedBankId.data.toLocaleLowerCase());
      if (!bankMapping) {
        return reply.status(404).send(errorResponse('Bank mapping not found'));
      }

      return AdminBankMappingDetailResponseV1Schema.parse({ bankMapping });
    });

    app.patch('/api/admin/bank-mappings/:bankId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const writeRequired = requireAdminPermission(session, 'bank_mapping:write');
      if (!writeRequired.ok) {
        return reply.status(writeRequired.statusCode).send(errorResponse(writeRequired.error));
      }

      const parsedBody = UpdateAdminBankMappingRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid bank mapping update request'));
      }

      if (requiresPublishPermission(parsedBody.data.changes)) {
        const publishRequired = requireAdminPermission(session, 'bank_mapping:publish');
        if (!publishRequired.ok) {
          return reply.status(publishRequired.statusCode).send(errorResponse(publishRequired.error));
        }
      }

      const params = request.params as { bankId?: unknown };
      const parsedBankId = CaseInsensitiveUuidV1Schema.safeParse(params.bankId);
      if (!parsedBankId.success) {
        return reply.status(400).send(errorResponse('Invalid bank id'));
      }

      const result = await repository.updateBankMapping({
        bankId: parsedBankId.data.toLocaleLowerCase(),
        expectedVersion: parsedBody.data.expectedVersion,
        changes: parsedBody.data.changes,
        actor: {
          id: writeRequired.session.admin.id,
          displayName: writeRequired.session.admin.displayName,
        },
      });

      if (result.status === 'not_found') {
        return reply.status(404).send(errorResponse('Bank mapping not found'));
      }
      if (result.status === 'version_conflict') {
        return reply.status(409).send(errorResponse('Bank mapping version conflict'));
      }
      if (result.status === 'active_without_objective_questions') {
        return reply.status(422).send(errorResponse('Cannot publish bank mapping without objective questions'));
      }

      const changedFields = Object.keys(parsedBody.data.changes);
      const auditDiff = diffForAudit(result.before, result.after, changedFields);
      await auditService.record({
        actorAdminId: writeRequired.session.admin.id,
        action: 'bank_mapping.update',
        resourceType: 'bank_mapping',
        resourceId: result.after.bankId,
        before: auditDiff.before,
        after: auditDiff.after,
        metadata: {
          changedFields,
          beforeVersion: result.before.version,
          afterVersion: result.after.version,
        },
        result: 'success',
      });

      return AdminBankMappingDetailResponseV1Schema.parse({ bankMapping: result.after });
    });

    app.post('/api/admin/bank-mappings/bulk-status', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'bank_mapping:publish');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedBody = BulkUpdateAdminBankMappingStatusRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid bank mapping bulk status request'));
      }

      const result = await repository.bulkUpdateBankMappingStatus({
        items: parsedBody.data.items.map((item) => ({
          ...item,
          bankId: item.bankId.toLocaleLowerCase(),
        })),
        changes: parsedBody.data.changes,
        actor: {
          id: required.session.admin.id,
          displayName: required.session.admin.displayName,
        },
      });

      for (const item of result.updated) {
        const changedFields = Object.keys(parsedBody.data.changes);
        const auditDiff = diffForAudit(item.before, item.after, changedFields);
        await auditService.record({
          actorAdminId: required.session.admin.id,
          action: 'bank_mapping.update',
          resourceType: 'bank_mapping',
          resourceId: item.bankId,
          before: auditDiff.before,
          after: auditDiff.after,
          metadata: {
            bulk: true,
            changedFields,
            beforeVersion: item.before.version,
            afterVersion: item.version,
          },
          result: 'success',
        });
      }

      return BulkUpdateAdminBankMappingStatusResponseV1Schema.parse({
        updated: result.updated.map((item) => ({ bankId: item.bankId, version: item.version })),
        failed: result.failed,
      });
    });
  };
}
