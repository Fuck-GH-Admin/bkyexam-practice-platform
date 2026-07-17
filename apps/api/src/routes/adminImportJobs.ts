import type { FastifyInstance } from 'fastify';
import {
  AdminImportJobDetailResponseV1Schema,
  AdminImportJobEventListResponseV1Schema,
  AdminImportJobErrorReportResponseV1Schema,
  AdminImportJobListResponseV1Schema,
  ApiErrorResponseV1Schema,
  CaseInsensitiveUuidV1Schema,
  CreateAdminImportJobRequestV1Schema,
  CreateAdminImportJobResponseV1Schema,
  ListAdminImportJobsRequestV1Schema,
  ListAdminImportJobEventsRequestV1Schema,
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
  type AdminImportJobExecutionMode,
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
  resetModeEnabled?: boolean;
  importRunner?: AdminImportJobRunner;
  executionMode?: AdminImportJobExecutionMode;
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
    enableResetMode: options.resetModeEnabled ?? false,
    importRun: options.importRunner,
    executionMode: options.executionMode,
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

    app.get('/api/admin/import-jobs/:jobId/events', async (request, reply) => {
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
      const jobId = parsedJobId.data.toLocaleLowerCase();
      const job = await service.findImportJobById(jobId);
      if (!job) {
        return reply.status(404).send(errorResponse('Import job not found'));
      }

      const parsedQuery = ListAdminImportJobEventsRequestV1Schema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send(errorResponse('Invalid import job event query'));
      }
      const headerEventId = request.headers['last-event-id'];
      const afterEventId = typeof headerEventId === 'string' && /^\d+$/.test(headerEventId)
        ? headerEventId
        : parsedQuery.data.afterEventId;

      if (!String(request.headers.accept ?? '').includes('text/event-stream')) {
        const events = await repository.listImportJobEvents({
          jobId,
          afterEventId,
          limit: parsedQuery.data.limit,
        });
        return AdminImportJobEventListResponseV1Schema.parse({
          events,
          lastEventId: events.at(-1)?.id ?? afterEventId,
        });
      }

      reply.hijack();
      reply.raw.statusCode = 200;
      reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');
      reply.raw.flushHeaders?.();

      let closed = false;
      request.raw.on('close', () => {
        closed = true;
      });
      let cursor = afterEventId;
      let keepaliveAt = Date.now();

      while (!closed) {
        const events = await repository.listImportJobEvents({
          jobId,
          afterEventId: cursor,
          limit: 100,
        });
        for (const event of events) {
          reply.raw.write(`id: ${event.id}\n`);
          reply.raw.write(`event: ${event.type}\n`);
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
          cursor = event.id;
        }

        const latest = events.at(-1)?.job ?? await service.findImportJobById(jobId);
        if (latest && isTerminalImportJobStatus(latest.status) && events.length === 0) {
          break;
        }
        if (Date.now() - keepaliveAt >= 15_000) {
          reply.raw.write(': keepalive\n\n');
          keepaliveAt = Date.now();
        }
        await delay(750);
      }

      if (!reply.raw.destroyed) reply.raw.end();
      return reply;
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
        return reply.status(409).send(errorResponse('Import job already queued or running'));
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
      if (result.status === 'reset_mode_not_enabled') {
        return reply.status(422).send(errorResponse('Import reset mode is not enabled'));
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

    app.post('/api/admin/import-jobs/:jobId/cancel', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'import_job:cancel');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { jobId?: unknown };
      const parsedJobId = CaseInsensitiveUuidV1Schema.safeParse(params.jobId);
      if (!parsedJobId.success) {
        return reply.status(400).send(errorResponse('Invalid import job id'));
      }

      const result = await service.cancelImportJob(parsedJobId.data.toLocaleLowerCase());
      if (result.status === 'not_found') {
        return reply.status(404).send(errorResponse('Import job not found'));
      }
      if (result.status === 'not_cancelable') {
        return reply.status(409).send(errorResponse('Import job cannot be cancelled'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'import_job.cancel',
        resourceType: 'import_job',
        resourceId: result.job.id,
        before: { status: result.beforeStatus },
        after: {
          kind: result.job.kind,
          mode: result.job.mode,
          status: result.job.status,
          sourceDir: result.job.sourceDir,
        },
        metadata: {},
        result: 'success',
      });

      return AdminImportJobDetailResponseV1Schema.parse({ job: result.job });
    });

    app.post('/api/admin/import-jobs/:jobId/retry', async (request, reply) => {
      const session = await sessionService.resolveAdmin(request.cookies[adminSessionCookieName]);
      const required = requireAdminPermission(session, 'import_job:retry');
      if (!required.ok) {
        return reply.status(required.statusCode).send(errorResponse(required.error));
      }

      const params = request.params as { jobId?: unknown };
      const parsedJobId = CaseInsensitiveUuidV1Schema.safeParse(params.jobId);
      if (!parsedJobId.success) {
        return reply.status(400).send(errorResponse('Invalid import job id'));
      }

      const result = await service.retryImportJob({
        jobId: parsedJobId.data.toLocaleLowerCase(),
        actor: {
          id: required.session.admin.id,
          displayName: required.session.admin.displayName,
          roles: required.session.admin.roles,
        },
      });

      if (result.status === 'not_found') {
        return reply.status(404).send(errorResponse('Import job not found'));
      }
      if (result.status === 'not_retryable') {
        return reply.status(409).send(errorResponse('Import job cannot be retried'));
      }
      if (result.status === 'running_conflict') {
        return reply.status(409).send(errorResponse('Import job already queued or running'));
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
      if (result.status === 'reset_mode_not_enabled') {
        return reply.status(422).send(errorResponse('Import reset mode is not enabled'));
      }

      await auditService.record({
        actorAdminId: required.session.admin.id,
        action: 'import_job.retry',
        resourceType: 'import_job',
        resourceId: result.job.id,
        after: {
          kind: result.job.kind,
          mode: result.job.mode,
          status: result.job.status,
          sourceDir: result.job.sourceDir,
        },
        metadata: {
          sourceJobId: result.sourceJob.id,
          sourceStatus: result.sourceJob.status,
          options: result.job.options,
        },
        result: 'success',
      });

      return AdminImportJobDetailResponseV1Schema.parse({ job: result.job });
    });
  };
}

function isTerminalImportJobStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });
}
