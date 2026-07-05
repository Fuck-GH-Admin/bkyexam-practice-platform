import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { createMemoryStudentSessionRepository, createSessionService } from './auth/session.js';
import type { StudentAuthRepository } from './auth/studentAuth.js';
import type { PracticeRepository } from './practice/repository.js';
import { createMemoryPracticeRepository } from './practice/repository.js';
import { registerAuthRoutes, sessionCookieName } from './routes/auth.js';
import { createBankRoutes, createMemoryBankRepository, type BankRepository } from './routes/banks.js';
import { registerHealthRoutes } from './routes/health.js';
import { createPracticeRoutes } from './routes/practice.js';
import { createWrongQuestionRoutes } from './routes/wrongQuestions.js';
import type { WrongQuestionRepository } from './wrongQuestions/repository.js';
import { createMemoryWrongQuestionRepository } from './wrongQuestions/repository.js';

interface BuildAppOptions {
  authRepository?: StudentAuthRepository;
  bankRepository?: BankRepository;
  practiceRepository?: PracticeRepository;
  wrongQuestionRepository?: WrongQuestionRepository;
  sessionService?: ReturnType<typeof createSessionService>;
  cookieSecret?: string;
  cookieSecure?: boolean;
  sessionTtlDays?: number;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const bankRepository = options.bankRepository ?? createMemoryBankRepository();
  const practiceRepository = options.practiceRepository ?? createMemoryPracticeRepository();
  const wrongQuestionRepository = options.wrongQuestionRepository ?? createMemoryWrongQuestionRepository();
  const sessionService = options.sessionService
    ?? createSessionService(createMemoryStudentSessionRepository(), { ttlDays: options.sessionTtlDays ?? 30 });

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
  void app.register(createBankRoutes(bankRepository));
  void app.register(createPracticeRoutes({
    practiceRepository,
    requireStudent: (request) => sessionService.resolveStudent(request.cookies[sessionCookieName]),
  }));
  void app.register(createWrongQuestionRoutes({
    wrongQuestionRepository,
    requireStudent: (request) => sessionService.resolveStudent(request.cookies[sessionCookieName]),
  }));
  void app.register(registerHealthRoutes);

  return app;
}
