import type { FastifyInstance } from 'fastify';
import {
  AdminStudentDetailResponseV1Schema,
  AdminStudentListResponseV1Schema,
  ApiErrorResponseV1Schema,
  BulkCreateAdminStudentsRequestV1Schema,
  BulkCreateAdminStudentsResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  CreateAdminStudentRequestV1Schema,
  ListAdminStudentsRequestV1Schema,
  ResetAdminStudentPasswordRequestV1Schema,
  ResetAdminStudentPasswordResponseV1Schema,
  RevokeAdminStudentSessionsResponseV1Schema,
  UpdateAdminStudentRequestV1Schema,
  type AdminPermissionV1,
} from '@bkyexam-practice/shared';
import {
  createAdminStudentService,
  createMemoryAdminStudentRepository,
  type AdminStudentRepository,
} from '../admin/adminStudents.js';
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

interface AdminStudentRoutesOptions {
  repository?: AdminStudentRepository;
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

export function createAdminStudentRoutes(options: AdminStudentRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAdminStudentRepository();
  const service = createAdminStudentService(repository);
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });
  const auditService = options.auditService ?? createAuditService(createMemoryAuditLogRepository());

  return async function registerAdminStudentRoutes(app: FastifyInstance) {
    app.get('/api/admin/students', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'student_account:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedQuery = ListAdminStudentsRequestV1Schema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send(errorResponse('Invalid student account query'));
      }

      const page = await service.listStudents(parsedQuery.data);
      return AdminStudentListResponseV1Schema.parse(page);
    });

    app.get('/api/admin/students/:studentId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'student_account:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const studentId = parseStudentId(request.params);
      if (!studentId) {
        return reply.status(400).send(errorResponse('Invalid student id'));
      }

      const student = await service.findStudentById(studentId);
      if (!student) {
        return reply.status(404).send(errorResponse('Student account not found'));
      }

      return AdminStudentDetailResponseV1Schema.parse({ student });
    });

    app.post('/api/admin/students', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'student_account:write');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedBody = CreateAdminStudentRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid student account request'));
      }

      const result = await service.createStudent(parsedBody.data, {
        id: required.session.admin.id,
        displayName: required.session.admin.displayName,
      });
      if (result.status === 'login_name_conflict') {
        return reply.status(409).send(errorResponse('Student loginName already exists'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'student_account.create',
        resourceType: 'student',
        resourceId: result.student.id,
        after: publicStudentAuditPayload(result.student),
        metadata: { passwordSet: true },
        result: 'success',
      });

      return AdminStudentDetailResponseV1Schema.parse({ student: result.student });
    });

    app.post('/api/admin/students/bulk-create', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'student_account:write');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedBody = BulkCreateAdminStudentsRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid bulk student account request'));
      }

      const result = await service.bulkCreateStudents(parsedBody.data, {
        id: required.session.admin.id,
        displayName: required.session.admin.displayName,
      });

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'student_account.bulk_create',
        resourceType: 'student',
        resourceId: 'bulk',
        after: {
          createdLoginNames: result.created.map((student) => student.loginName),
          skipped: result.skipped,
          failed: result.failed,
        },
        metadata: {
          requested: parsedBody.data.students.length,
          created: result.created.length,
          skipped: result.skipped.length,
          failed: result.failed.length,
          skipExisting: parsedBody.data.options.skipExisting,
        },
        result: 'success',
      });

      return BulkCreateAdminStudentsResponseV1Schema.parse(result);
    });

    app.patch('/api/admin/students/:studentId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'student_account:write');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const studentId = parseStudentId(request.params);
      if (!studentId) {
        return reply.status(400).send(errorResponse('Invalid student id'));
      }

      const parsedBody = UpdateAdminStudentRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid student account request'));
      }

      const result = await service.updateStudent(studentId, parsedBody.data);
      if (result.status === 'not_found') {
        return reply.status(404).send(errorResponse('Student account not found'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'student_account.update',
        resourceType: 'student',
        resourceId: result.after.id,
        before: publicStudentAuditPayload(result.before),
        after: publicStudentAuditPayload(result.after),
        result: 'success',
      });

      return AdminStudentDetailResponseV1Schema.parse({ student: result.after });
    });

    app.post('/api/admin/students/:studentId/reset-password', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'student_account:reset_password');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const studentId = parseStudentId(request.params);
      if (!studentId) {
        return reply.status(400).send(errorResponse('Invalid student id'));
      }

      const parsedBody = ResetAdminStudentPasswordRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid password reset request'));
      }

      const result = await service.resetStudentPassword(studentId, parsedBody.data);
      if (result.status === 'not_found') {
        return reply.status(404).send(errorResponse('Student account not found'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'student_account.reset_password',
        resourceType: 'student',
        resourceId: result.student.id,
        after: publicStudentAuditPayload(result.student),
        metadata: {
          passwordResetRequired: true,
          revokedSessions: result.revokedSessions,
        },
        result: 'success',
      });

      return ResetAdminStudentPasswordResponseV1Schema.parse({
        student: result.student,
        revokedSessions: result.revokedSessions,
      });
    });

    app.post('/api/admin/students/:studentId/revoke-sessions', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'student_account:revoke_session');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const studentId = parseStudentId(request.params);
      if (!studentId) {
        return reply.status(400).send(errorResponse('Invalid student id'));
      }

      const result = await service.revokeStudentSessions(studentId);
      if (result.status === 'not_found') {
        return reply.status(404).send(errorResponse('Student account not found'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'student_account.revoke_sessions',
        resourceType: 'student',
        resourceId: result.studentId,
        after: publicStudentAuditPayload(result.student),
        metadata: { revokedSessions: result.revokedSessions },
        result: 'success',
      });

      return RevokeAdminStudentSessionsResponseV1Schema.parse({
        studentId: result.studentId,
        revokedSessions: result.revokedSessions,
      });
    });
  };
}

function parseStudentId(params: unknown): string | null {
  const parsed = CaseInsensitiveUuidV1Schema.safeParse((params as { studentId?: unknown }).studentId);
  return parsed.success ? parsed.data.toLocaleLowerCase() : null;
}

function publicStudentAuditPayload(student: {
  id: string;
  loginName: string;
  displayName: string;
  className: string | null;
  groupName: string | null;
  status: string;
  passwordResetRequired: boolean;
}) {
  return {
    id: student.id,
    loginName: student.loginName,
    displayName: student.displayName,
    className: student.className,
    groupName: student.groupName,
    status: student.status,
    passwordResetRequired: student.passwordResetRequired,
  };
}
