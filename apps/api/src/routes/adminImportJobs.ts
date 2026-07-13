import type { FastifyInstance } from 'fastify';
import {
  AdminImportJobDetailResponseV1Schema,
  AdminImportJobErrorReportResponseV1Schema,
  AdminImportJobListResponseV1Schema,
  ApiErrorResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  CreateAdminImportJobRequestV1Schema,
  CreateAdminImportJobResponseV1Schema,
  ListAdminImportJobsRequestV1Schema,
  type AdminPermissionV1,
} from '@bkyexam-practice/shared';
import {
  createAuditService,
  createMemoryAuditLogRepository,
  type AuditService,
} from '../admin/audit.js';
import {
  createAdminImportJobService,
  createMemoryAdminImportJobRepository,
  type AdminImportJobRepository,
  type AdminImportJobRunner,
  type AdminImportJobService,
} from '../admin/importJobs.js';
import { hasAdminPermission } from '../admin/rbac.js';
import {
  createAdminSessionService,
  createMemoryAdminSessionRepository,
  type ResolvedAdminSession,
} from '../admin/session.js';
import { adminSessionCookieName } from './adminAuth.js';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

interface AdminImportJobRoutesOptions {
  repository?: AdminImportJobRepository;
  service?: AdminImportJobService;
  sessionService?: AdminSessionService;
  auditService?: AuditService;
  allowedRoots?: readonly string[];
  importModeEnabled?: boolean;
  importRunner?: AdminImportJobRunner;
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

export function createAdminImportJobRoutes(options: AdminImportJobRoutesOptions = {}) {
  const repository = options.repository ?? createMemoryAdminImportJobRepository();
  const service = options.service ?? createAdminImportJobService(repository, {
    allowedRoots: options.allowedRoots ?? [],
    enableImportMode: options.importModeEnabled ?? false,
    importRun: options.importRunner,
  });
  const sessionService = options.sessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), { ttlHours: 8 });
  const auditService = options.auditService ?? createAuditService(createMemoryAuditLogRepository());

  return async function registerAdminImportJobRoutes(app: FastifyInstance) {
    app.get('/api/admin/import-jobs', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'import_job:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedQuery = ListAdminImportJobsRequestV1Schema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send(errorResponse('Invalid import job query'));
      }

      const page = await service.listImportJobs(parsedQuery.data);
      return AdminImportJobListResponseV1Schema.parse(page);
    });

    app.get('/api/admin/import-jobs/:jobId', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'import_job:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { jobId?: unknown };
      const parsedJobId = CaseInsensitiveUuidV1Schema.safeParse(params.jobId);
      if (!parsedJobId.success) {
        return reply.status(400).send(errorResponse('Invalid import job id'));
      }

      const job = await service.findImportJobById(parsedJobId.data.toLocaleLowerCase());
      if (!job) {
        return reply.status(404).send(errorResponse('Import job not found'));
      }

      return AdminImportJobDetailResponseV1Schema.parse({ job });
    });

    app.get('/api/admin/import-jobs/:jobId/errors', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'import_job:read');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { jobId?: unknown };
      const parsedJobId = CaseInsensitiveUuidV1Schema.safeParse(params.jobId);
      if (!parsedJobId.success) {
        return reply.status(400).send(errorResponse('Invalid import job id'));
      }

      const job = await service.findImportJobById(parsedJobId.data.toLocaleLowerCase());
      if (!job) {
        return reply.status(404).send(errorResponse('Import job not found'));
      }

      return AdminImportJobErrorReportResponseV1Schema.parse({
        jobId: job.id,
        status: job.status,
        errorSummary: job.errorSummary,
      });
    });

    app.post('/api/admin/import-jobs', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'import_job:create');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const parsedBody = CreateAdminImportJobRequestV1Schema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send(errorResponse('Invalid import job request'));
      }

      const result = await service.createImportJob({
        request: parsedBody.data,
        actor: {
          id: required.session.admin.id,
          displayName: required.session.admin.displayName,
          roles: required.session.admin.roles,
        },
      });

      if (result.status === 'running_conflict') {
        return reply.status(409).send(errorResponse('Import job already running'));
      }
      if (result.status === 'source_dir_forbidden') {
        return reply.status(403).send(errorResponse('Import source directory is not allowed'));
      }
      if (result.status === 'reset_requires_super_admin') {
        return reply.status(403).send(errorResponse('resetBeforeImport requires super_admin'));
      }
      if (result.status === 'import_mode_not_enabled') {
        return reply.status(422).send(errorResponse('Import mode is not enabled yet'));
      }
      if (result.status === 'reset_import_not_enabled') {
        return reply.status(422).send(errorResponse('resetBeforeImport is not enabled for import mode yet'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'import_job.create',
        resourceType: 'import_job',
        resourceId: result.job.id,
        after: {
          kind: result.job.kind,
          mode: result.job.mode,
          status: result.job.status,
          sourceDir: result.job.sourceDir,
        },
        metadata: {
          options: result.job.options,
        },
        result: 'success',
      });

      return CreateAdminImportJobResponseV1Schema.parse({ job: result.job });
    });
  };
}
