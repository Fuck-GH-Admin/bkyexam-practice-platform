import type { FastifyInstance } from 'fastify';
import {
  AdminSystemStatusResponseV1Schema,
  ApiErrorResponseV1Schema,
} from '@bkyexam-practice/shared';
import { hasAdminPermission } from '../admin/rbac.js';
import {
  createMemoryAdminSystemStatusRepository,
  type AdminSystemStatusRepository,
} from '../admin/systemStatus.js';
import {
  createAdminSessionService,
  createMemoryAdminSessionRepository,
} from '../admin/session.js';
import { adminSessionCookieName } from './adminAuth.js';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

interface AdminSystemStatusRoutesOptions {
  repository?: AdminSystemStatusRepository;
  sessionService?: AdminSessionService;
}

function errorResponse(error: string) {
  return ApiErrorResponseV1Schema.parse({ error });
}

export function createAdminSystemStatusRoutes(options: AdminSystemStatusRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAdminSystemStatusRepository();
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });

  return async function registerAdminSystemStatusRoutes(app: FastifyInstance) {
    app.get('/api/admin/system/status', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      if (!session) {
        return reply.status(401).send(errorResponse('Unauthenticated'));
      }

      if (!hasAdminPermission(session.admin, 'system_status:read')) {
        return reply.status(403).send(errorResponse('Forbidden'));
      }

      const status = await repository.getSystemStatus();
      return AdminSystemStatusResponseV1Schema.parse(status);
    });
  };
}
