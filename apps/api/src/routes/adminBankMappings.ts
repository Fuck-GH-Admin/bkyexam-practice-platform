import type { FastifyInstance } from 'fastify';
import {
  AdminBankMappingDetailResponseV1Schema,
  AdminBankMappingListResponseV1Schema,
  ApiErrorResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  ListAdminBankMappingsRequestV1Schema,
} from '@bkyexam-practice/shared';
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
}

function errorResponse(error: string) {
  return ApiErrorResponseV1Schema.parse({ error });
}

function requireBankMappingRead(
  session: ResolvedAdminSession | null,
): { ok: true; session: ResolvedAdminSession } | { ok: false; statusCode: 401 | 403; error: string } {
  if (!session) {
    return { ok: false, statusCode: 401, error: 'Unauthenticated' };
  }

  if (!hasAdminPermission(session.admin, 'bank_mapping:read')) {
    return { ok: false, statusCode: 403, error: 'Forbidden' };
  }

  return { ok: true, session };
}

export function createAdminBankMappingRoutes(options: AdminBankMappingRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAdminBankMappingRepository();
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });

  return async function registerAdminBankMappingRoutes(app: FastifyInstance) {
    app.get('/api/admin/bank-mappings', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireBankMappingRead(session);
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
      const required = requireBankMappingRead(session);
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
  };
}
