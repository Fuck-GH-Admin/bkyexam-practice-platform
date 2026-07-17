import type { FastifyInstance } from 'fastify';
import {
  AdminUserDetailResponseV1Schema,
  AdminUserListResponseV1Schema,
  ApiErrorResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  CreateAdminUserRequestV1Schema,
  ListAdminUsersRequestV1Schema,
  UpdateAdminUserRequestV1Schema,
  type AdminPermissionV1,
} from '@bkyexam-practice/shared';
import {
  createAdminUserService,
  createMemoryAdminUserRepository,
  type AdminUserRepository,
} from '../admin/adminUsers.js';
import {
  createAuditService,
  createMemoryAuditLogRepository,
  type AuditService,
} from '../admin/audit.js';
import { hasAdminPermission } from '../admin/rbac.js';
import {
  createAdminSessionService,
  createMemoryAdminSessionRepository,
  type ResolvedAdminSession,
} from '../admin/session.js';
import { adminSessionCookieName } from './adminAuth.js';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

interface AdminUserRoutesOptions {
  repository?: AdminUserRepository;
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

export function createAdminUserRoutes(options: AdminUserRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAdminUserRepository();
  const service = createAdminUserService(repository);
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });
  const auditService = options.auditService ?? createAuditService(createMemoryAuditLogRepository());

  return async function registerAdminUserRoutes(app: FastifyInstance) {
    app.get('/api/admin/users', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'admin_user:manage');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedQuery = ListAdminUsersRequestV1Schema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send(errorResponse('Invalid admin user query'));
      }

      const page = await service.listAdminUsers(parsedQuery.data);
      return AdminUserListResponseV1Schema.parse(page);
    });

    app.get('/api/admin/users/:adminId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'admin_user:manage');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { adminId?: unknown };
      const parsedAdminId = CaseInsensitiveUuidV1Schema.safeParse(params.adminId);
      if (!parsedAdminId.success) {
        return reply.status(400).send(errorResponse('Invalid admin user id'));
      }

      const adminUser = await service.findAdminUserById(parsedAdminId.data.toLocaleLowerCase());
      if (!adminUser) {
        return reply.status(404).send(errorResponse('Admin user not found'));
      }

      return AdminUserDetailResponseV1Schema.parse({ adminUser });
    });

    app.post('/api/admin/users', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'admin_user:manage');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedBody = CreateAdminUserRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid admin user request'));
      }

      const result = await service.createAdminUser(parsedBody.data);
      if (result.status === 'login_name_conflict') {
        return reply.status(409).send(errorResponse('Admin loginName already exists'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'admin_user.create',
        resourceType: 'admin_user',
        resourceId: result.adminUser.id,
        after: {
          loginName: result.adminUser.loginName,
          displayName: result.adminUser.displayName,
          status: result.adminUser.status,
          roles: result.adminUser.roles,
        },
        metadata: { passwordSet: true },
        result: 'success',
      });

      return AdminUserDetailResponseV1Schema.parse({ adminUser: result.adminUser });
    });

    app.patch('/api/admin/users/:adminId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'admin_user:manage');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { adminId?: unknown };
      const parsedAdminId = CaseInsensitiveUuidV1Schema.safeParse(params.adminId);
      if (!parsedAdminId.success) {
        return reply.status(400).send(errorResponse('Invalid admin user id'));
      }

      const parsedBody = UpdateAdminUserRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid admin user request'));
      }

      const result = await service.updateAdminUser(parsedAdminId.data.toLocaleLowerCase(), parsedBody.data);
      if (result.status === 'not_found') {
        return reply.status(404).send(errorResponse('Admin user not found'));
      }
      if (result.status === 'last_super_admin') {
        return reply.status(409).send(errorResponse('Cannot remove or disable the last active super_admin'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'admin_user.update',
        resourceType: 'admin_user',
        resourceId: result.after.id,
        before: {
          displayName: result.before.displayName,
          status: result.before.status,
          roles: result.before.roles,
        },
        after: {
          displayName: result.after.displayName,
          status: result.after.status,
          roles: result.after.roles,
        },
        metadata: { passwordChanged: result.passwordChanged },
        result: 'success',
      });

      return AdminUserDetailResponseV1Schema.parse({ adminUser: result.after });
    });
  };
}
