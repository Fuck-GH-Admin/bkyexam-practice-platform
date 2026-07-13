import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  AdminLoginRequestV1Schema,
  AdminLoginResponseV1Schema,
  AdminLogoutResponseV1Schema,
  AdminMeResponseV1Schema,
  ApiErrorResponseV1Schema,
  type AdminPermissionV1,
} from '@bkyexam-practice/shared';
import {
  AdminAuthError,
  createAdminAuthService,
  createMemoryAdminAuthRepository,
  type AdminAuthRepository,
} from '../admin/auth.js';
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

export const adminSessionCookieName = 'bky_admin_session';

function errorResponse(error: string) {
  return ApiErrorResponseV1Schema.parse({ error });
}

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

interface AdminAuthRoutesOptions {
  repository?: AdminAuthRepository;
  sessionService?: AdminSessionService;
  auditService?: AuditService;
  cookieSecure?: boolean;
  sessionTtlHours?: number;
}

function toAdminAuthResponse(session: ResolvedAdminSession) {
  return {
    admin: session.admin,
    expiresAt: session.expiresAt.toISOString(),
  };
}

function setAdminSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure: boolean,
) {
  reply.setCookie(adminSessionCookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    expires: expiresAt,
  });
}

function clearAdminSessionCookie(
  reply: FastifyReply,
  secure: boolean,
) {
  reply.clearCookie(adminSessionCookieName, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  });
}

async function recordAdminLoginFailure(
  auditService: AuditService,
  loginName: string,
  reason: string,
) {
  await auditService.record({
    actorAdminId: null,
    action: 'admin.auth.login',
    resourceType: 'admin_user',
    resourceId: loginName || 'unknown',
    metadata: { loginName, reason },
    result: 'failure',
  });
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

export async function registerAdminAuthRoutes(app: FastifyInstance, options: AdminAuthRoutesOptions = {}) {
  const authRepository = options.repository ?? createMemoryAdminAuthRepository();
  const authService = createAdminAuthService(authRepository);
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), {
      ttlHours: options.sessionTtlHours ?? 8,
    });
  const auditService = options.auditService
    ?? createAuditService(createMemoryAuditLogRepository());
  const cookieSecure = options.cookieSecure ?? false;

  app.post('/api/admin/auth/login', async (request, reply) => {
    const parsedBody = AdminLoginRequestV1Schema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send(errorResponse('Invalid admin login request'));
    }

    const { loginName, password } = parsedBody.data;
    let admin;
    try {
      admin = await authService.login({ loginName, password });
    } catch (error) {
      if (error instanceof AdminAuthError) {
        if (error.code === 'invalid_credentials') {
          await recordAdminLoginFailure(auditService, loginName.trim(), error.code);
          return reply.status(401).send(errorResponse('Invalid admin credentials'));
        }
        if (error.code === 'disabled') {
          await recordAdminLoginFailure(auditService, loginName.trim(), error.code);
          return reply.status(403).send(errorResponse('Admin user disabled'));
        }
        return reply.status(400).send(errorResponse('Invalid admin login request'));
      }

      throw error;
    }

    const createdSession = await sessionService.createSession(admin);
    setAdminSessionCookie(reply, createdSession.token, createdSession.expiresAt, cookieSecure);
    await auditService.record({
      actorAdminId: admin.id,
      action: 'admin.auth.login',
      resourceType: 'admin_user',
      resourceId: admin.id,
      after: { loginName: admin.loginName, roles: admin.roles },
      metadata: { loginName: admin.loginName },
      result: 'success',
    });

    return AdminLoginResponseV1Schema.parse({
      admin,
      expiresAt: createdSession.expiresAt.toISOString(),
    });
  });

  app.get('/api/admin/me', async (request, reply) => {
    const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
    const required = requireAdminPermission(session, 'admin:self:read');
    if (!required.ok) {
      return reply.status(required.statusCode).send(errorResponse(required.error));
    }

    return AdminMeResponseV1Schema.parse(toAdminAuthResponse(required.session));
  });

  app.post('/api/admin/auth/logout', async (request, reply) => {
    const token = request.cookies[adminSessionCookieName];
    const session = await sessionService.resolveAdmin(token);
    await sessionService.revokeSession(token);
    clearAdminSessionCookie(reply, cookieSecure);

    if (session) {
      await auditService.record({
        actorAdminId: session.admin.id,
        action: 'admin.auth.logout',
        resourceType: 'admin_user',
        resourceId: session.admin.id,
        metadata: { loginName: session.admin.loginName },
        result: 'success',
      });
    }

    return AdminLogoutResponseV1Schema.parse({ success: true });
  });
}
