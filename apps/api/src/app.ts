import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import {
  createAuditService,
  createMemoryAuditLogRepository,
  type AuditService,
} from './admin/audit.js';
import type { AdminAuthRepository } from './admin/auth.js';
import { createAdminSessionService, createMemoryAdminSessionRepository } from './admin/session.js';
import { createMemoryStudentSessionRepository, createSessionService } from './auth/session.js';
import type { StudentAuthRepository } from './auth/studentAuth.js';
import { createMemoryPracticeSessionService, type PracticeSessionService } from './modules/practice/sessionService.js';
import type { PracticeRepository } from './practice/repository.js';
import { createMemoryPracticeRepository } from './practice/repository.js';
import { registerAdminAuthRoutes } from './routes/adminAuth.js';
import { registerAuthRoutes, sessionCookieName } from './routes/auth.js';
import { createBankRoutes, createMemoryBankRepository, type BankRepository } from './routes/banks.js';
import { registerHealthRoutes } from './routes/health.js';
import { createPracticeRoutes } from './routes/practice.js';
import { createWrongQuestionRoutes } from './routes/wrongQuestions.js';
import type { WrongQuestionRepository } from './wrongQuestions/repository.js';
import { createMemoryWrongQuestionRepository } from './wrongQuestions/repository.js';
import { createWrongQuestionService, type WrongQuestionService } from './wrongQuestions/service.js';

interface BuildAppOptions {
  authRepository?: StudentAuthRepository;
  adminAuthRepository?: AdminAuthRepository;
  bankRepository?: BankRepository;
  practiceRepository?: PracticeRepository;
  practiceSessionService?: PracticeSessionService;
  wrongQuestionRepository?: WrongQuestionRepository;
  wrongQuestionService?: WrongQuestionService;
  sessionService?: ReturnType<typeof createSessionService>;
  adminSessionService?: ReturnType<typeof createAdminSessionService>;
  auditService?: AuditService;
  logger?: boolean;
  cookieSecret?: string;
  cookieSecure?: boolean;
  sessionTtlDays?: number;
  adminSessionTtlHours?: number;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? process.env.NODE_ENV !== 'test' });
  const bankRepository = options.bankRepository ?? createMemoryBankRepository();
  const practiceRepository = options.practiceRepository ?? createMemoryPracticeRepository();
  const practiceSessionService = options.practiceSessionService ?? createMemoryPracticeSessionService();
  const wrongQuestionRepository = options.wrongQuestionRepository ?? createMemoryWrongQuestionRepository();
  const wrongQuestionService = options.wrongQuestionService ?? createWrongQuestionService({
    wrongQuestionRepository,
    practiceSessionService,
  });
  const sessionService = options.sessionService
    ?? createSessionService(createMemoryStudentSessionRepository(), { ttlDays: options.sessionTtlDays ?? 30 });
  const adminSessionService = options.adminSessionService
    ?? createAdminSessionService(createMemoryAdminSessionRepository(), {
      ttlHours: options.adminSessionTtlHours ?? 8,
    });
  const auditService = options.auditService ?? createAuditService(createMemoryAuditLogRepository());

  void app.register(cors, {
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true,
  });
  void app.register(cookie, { secret: options.cookieSecret ?? 'dev-cookie-secret-change-me' });
  void app.register(registerAuthRoutes, {
    repository: options.authRepository,
    sessionService,
    cookieSecure: options.cookieSecure ?? false,
  });
  void app.register(registerAdminAuthRoutes, {
    repository: options.adminAuthRepository,
    sessionService: adminSessionService,
    auditService,
    cookieSecure: options.cookieSecure ?? false,
    sessionTtlHours: options.adminSessionTtlHours ?? 8,
  });
  void app.register(createBankRoutes(bankRepository));
  void app.register(createPracticeRoutes({
    practiceRepository,
    requireStudent: (request) => sessionService.resolveStudent(request.cookies[sessionCookieName]),
  }));
  void app.register(createWrongQuestionRoutes({
    wrongQuestionRepository,
    wrongQuestionService,
    requireStudent: (request) => sessionService.resolveStudent(request.cookies[sessionCookieName]),
  }));
  void app.register(registerHealthRoutes);

  return app;
}
