import type { FastifyInstance } from 'fastify';
import {
  AdminAuditLogListResponseV1Schema,
  ApiErrorResponseV1Schema,
  ListAdminAuditLogsRequestV1Schema,
  type AdminPermissionV1,
} from '@bkyexam-practice/shared';
import {
  createMemoryAuditLogRepository,
  type AuditLogReadRepository,
} from '../admin/audit.js';
import { hasAdminPermission } from '../admin/rbac.js';
import {
  createAdminSessionService,
  createMemoryAdminSessionRepository,
  type ResolvedAdminSession,
} from '../admin/session.js';
import { adminSessionCookieName } from './adminAuth.js';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

interface AdminAuditLogRoutesOptions {
  repository?: AuditLogReadRepository;
  sessionService?: AdminSessionService;
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

export function createAdminAuditLogRoutes(options: AdminAuditLogRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAuditLogRepository();
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });

  return async function registerAdminAuditLogRoutes(app: FastifyInstance) {
    app.get('/api/admin/audit-logs', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'audit_log:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedQuery = ListAdminAuditLogsRequestV1Schema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send(errorResponse('Invalid audit log query'));
      }

      const page = await repository.listAuditLogs(parsedQuery.data);
      return AdminAuditLogListResponseV1Schema.parse(page);
    });
  };
}
