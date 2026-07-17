import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { ApiErrorResponseV1Schema } from '@bkyexam-practice/shared';
import Fastify, { type FastifyRequest } from 'fastify';
import {
  createAuditService,
  createMemoryAuditLogRepository,
  type AuditLogReadRepository,
  type AuditLogRepository,
  type AuditService,
} from './admin/audit.js';
import type { AdminUserRepository } from './admin/adminUsers.js';
import type { AdminBankMappingRepository } from './admin/bankMappings.js';
import type { AdminAuthRepository } from './admin/auth.js';
import type {
  AdminImportJobExecutionMode,
  AdminImportJobRepository,
  AdminImportJobRunner,
} from './admin/importJobs.js';
import type { AdminQuestionReviewRepository } from './admin/questionReview.js';
import type { AdminStudentRepository } from './admin/adminStudents.js';
import { createAdminSessionService, createMemoryAdminSessionRepository } from './admin/session.js';
import type { AdminSystemStatusRepository } from './admin/systemStatus.js';
import { createMemoryStudentSessionRepository, createSessionService } from './auth/session.js';
import type { StudentAuthRepository, StudentAuthServiceOptions } from './auth/studentAuth.js';
import type { ReadinessProbe } from './health/readiness.js';
import { createMemoryLearningDashboardRepository, type LearningDashboardRepository } from './learning/repository.js';
import { createMemoryPracticeSessionService, type PracticeSessionService } from './modules/practice/sessionService.js';
import {
  registerBackendGuardrails,
  type CsrfOriginCheckOptions,
  type RateLimitOptions,
} from './platform/guardrails.js';
import {
  createMetricsRegistry,
  registerObservability,
  type MetricsRegistry,
} from './platform/observability.js';
import type { PracticeRepository } from './practice/repository.js';
import { createMemoryPracticeRepository } from './practice/repository.js';
import { registerAdminAuthRoutes } from './routes/adminAuth.js';
import { createAdminAuditLogRoutes } from './routes/adminAuditLogs.js';
import { createAdminBankMappingRoutes } from './routes/adminBankMappings.js';
import { createAdminImportJobRoutes } from './routes/adminImportJobs.js';
import { createAdminQuestionReviewRoutes } from './routes/adminQuestionReview.js';
import { createAdminStudentRoutes } from './routes/adminStudents.js';
import { createAdminSystemStatusRoutes } from './routes/adminSystemStatus.js';
import { createAdminUserRoutes } from './routes/adminUsers.js';
import { registerAuthRoutes, sessionCookieName } from './routes/auth.js';
import { createBankRoutes, createMemoryBankRepository, type BankRepository } from './routes/banks.js';
import { registerHealthRoutes } from './routes/health.js';
import { createLearningRoutes } from './routes/learning.js';
import { createPracticeRoutes } from './routes/practice.js';
import { createWrongQuestionRoutes } from './routes/wrongQuestions.js';
import type { WrongQuestionRepository } from './wrongQuestions/repository.js';
import { createMemoryWrongQuestionRepository } from './wrongQuestions/repository.js';
import { createWrongQuestionService, type WrongQuestionService } from './wrongQuestions/service.js';

interface BuildAppOptions {
  authRepository?: StudentAuthRepository;
  adminAuthRepository?: AdminAuthRepository;
  adminBankMappingRepository?: AdminBankMappingRepository;
  adminImportJobRepository?: AdminImportJobRepository;
  adminImportAllowedRoots?: readonly string[];
  adminImportModeEnabled?: boolean;
  adminImportResetEnabled?: boolean;
  adminImportRunner?: AdminImportJobRunner;
  adminImportExecutionMode?: AdminImportJobExecutionMode;
  adminQuestionReviewRepository?: AdminQuestionReviewRepository;
  adminStudentRepository?: AdminStudentRepository;
  adminSystemStatusRepository?: AdminSystemStatusRepository;
  adminUserRepository?: AdminUserRepository;
  bankRepository?: BankRepository;
  learningRepository?: LearningDashboardRepository;
  practiceRepository?: PracticeRepository;
  practiceSessionService?: PracticeSessionService;
  wrongQuestionRepository?: WrongQuestionRepository;
  wrongQuestionService?: WrongQuestionService;
  sessionService?: ReturnType<typeof createSessionService>;
  adminSessionService?: ReturnType<typeof createAdminSessionService>;
  auditService?: AuditService;
  auditLogRepository?: AuditLogRepository & AuditLogReadRepository;
  logger?: boolean;
  cookieSecret?: string;
  cookieSecure?: boolean;
  sessionTtlDays?: number;
  studentAuthOptions?: StudentAuthServiceOptions;
  adminSessionTtlHours?: number;
  readinessProbe?: ReadinessProbe;
  metricsRegistry?: MetricsRegistry;
  rateLimit?: RateLimitOptions;
  csrfOriginCheck?: CsrfOriginCheckOptions;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? process.env.NODE_ENV !== 'test' });
  const metricsRegistry = options.metricsRegistry ?? createMetricsRegistry();
  registerObservability(app, metricsRegistry);
  registerBackendGuardrails(app, {
    rateLimit: options.rateLimit,
    csrfOriginCheck: options.csrfOriginCheck,
  });
  const bankRepository = options.bankRepository ?? createMemoryBankRepository();
  const learningRepository = options.learningRepository ?? createMemoryLearningDashboardRepository();
  const practiceRepository = options.practiceRepository ?? createMemoryPracticeRepository();
  const practiceSessionService = options.practiceSessionService ?? createMemoryPracticeSessionService();
  const wrongQuestionRepository = options.wrongQuestionRepository ?? createMemoryWrongQuestionRepository();
  const wrongQuestionService = options.wrongQuestionService ?? createWrongQuestionService({
    wrongQuestionRepository,
    practiceSessionService,
  });
  const sessionService = options.sessionService
    ?? createSessionService(createMemoryStudentSessionRepository(), { ttlDays: options.sessionTtlDays ?? 30 });
  const studentByRequest = new WeakMap<FastifyRequest, ReturnType<typeof sessionService.resolveStudent>>();
  const resolveRequestStudent = (request: FastifyRequest) => {
    const existing = studentByRequest.get(request);
    if (existing) return existing;

    const resolved = sessionService.resolveStudent(request.cookies[sessionCookieName]);
    studentByRequest.set(request, resolved);
    return resolved;
  };
  const adminSessionService = options.adminSessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), {
      ttlHours: options.adminSessionTtlHours ?? 8,
    });
  const auditLogRepository = options.auditLogRepository ?? createMemoryAuditLogRepository();
  const auditService = options.auditService ?? createAuditService(auditLogRepository);

  void app.register(cors, {
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true,
  });
  void app.register(cookie, { secret: options.cookieSecret ?? 'dev-cookie-secret-change-me' });
  app.addHook('preHandler', async (request, reply) => {
    if (!requiresActivatedStudent(request.routeOptions.url)) return;

    const student = await resolveRequestStudent(request);
    if (student?.passwordResetRequired) {
      return reply.status(403).send(ApiErrorResponseV1Schema.parse({
        error: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED',
      }));
    }
  });
  void app.register(registerAuthRoutes, {
    repository: options.authRepository,
    sessionService,
    cookieSecure: options.cookieSecure ?? false,
    studentAuthOptions: options.studentAuthOptions,
  });
  void app.register(registerAdminAuthRoutes, {
    repository: options.adminAuthRepository,
    sessionService: adminSessionService,
    auditService,
    cookieSecure: options.cookieSecure ?? false,
    sessionTtlHours: options.adminSessionTtlHours ?? 8,
  });
  void app.register(createAdminAuditLogRoutes({
    repository: auditLogRepository,
    sessionService: adminSessionService,
  }));
  void app.register(createAdminUserRoutes({
    repository: options.adminUserRepository,
    sessionService: adminSessionService,
    auditService,
  }));
  void app.register(createAdminStudentRoutes({
    repository: options.adminStudentRepository,
    sessionService: adminSessionService,
    auditService,
  }));
  void app.register(createAdminBankMappingRoutes({
    repository: options.adminBankMappingRepository,
    sessionService: adminSessionService,
    auditService,
  }));
  void app.register(createAdminImportJobRoutes({
    repository: options.adminImportJobRepository,
    sessionService: adminSessionService,
    auditService,
    allowedRoots: options.adminImportAllowedRoots,
    importModeEnabled: options.adminImportModeEnabled ?? false,
    resetModeEnabled: options.adminImportResetEnabled ?? false,
    importRunner: options.adminImportRunner,
    executionMode: options.adminImportExecutionMode,
  }));
  void app.register(createAdminQuestionReviewRoutes({
    repository: options.adminQuestionReviewRepository,
    sessionService: adminSessionService,
    auditService,
  }));
  void app.register(createAdminSystemStatusRoutes({
    repository: options.adminSystemStatusRepository,
    sessionService: adminSessionService,
  }));
  void app.register(createBankRoutes(bankRepository));
  void app.register(createLearningRoutes({
    repository: learningRepository,
    requireStudent: resolveRequestStudent,
  }));
  void app.register(createPracticeRoutes({
    practiceRepository,
    requireStudent: resolveRequestStudent,
  }));
  void app.register(createWrongQuestionRoutes({
    wrongQuestionRepository,
    wrongQuestionService,
    requireStudent: resolveRequestStudent,
  }));
  void app.register(registerHealthRoutes, {
    readinessProbe: options.readinessProbe,
    metricsRegistry,
  });

  return app;
}

function requiresActivatedStudent(routeUrl: string | undefined): boolean {
  return routeUrl === '/api/practice'
    || routeUrl?.startsWith('/api/practice/') === true
    || routeUrl === '/api/wrong-questions'
    || routeUrl?.startsWith('/api/wrong-questions/') === true
    || routeUrl === '/api/learning'
    || routeUrl?.startsWith('/api/learning/') === true;
}
