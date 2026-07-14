import { createAuditService, createPgAuditLogRepository } from './admin/audit.js';
import { createPgAdminUserRepository } from './admin/adminUsers.js';
import { createPgAdminAuthRepository } from './admin/auth.js';
import { createPgAdminBankMappingRepository } from './admin/bankMappings.js';
import { createPgAdminImportJobRepository, createPgQuestionBankImportRunner } from './admin/importJobs.js';
import { createPgAdminQuestionReviewRepository } from './admin/questionReview.js';
import { createAdminSessionService, createPgAdminSessionRepository } from './admin/session.js';
import { createPgAdminStudentRepository } from './admin/adminStudents.js';
import { createPgAdminSystemStatusRepository } from './admin/systemStatus.js';
import { createPgStudentSessionRepository, createSessionService } from './auth/session.js';
import { createPgStudentAuthRepository } from './auth/studentAuth.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgPool } from './db/client.js';
import { createPgReadinessProbe } from './health/readiness.js';
import { createPgLearningDashboardRepository } from './learning/repository.js';
import { createPgPracticeSessionService } from './modules/practice/sessionService.js';
import { createPgPracticeRepository } from './practice/repository.js';
import { createPgBankRepository } from './repositories/bankRepository.js';
import { createPgWrongQuestionRepository } from './wrongQuestions/repository.js';

const config = loadConfig();
const pool = config.USE_DATABASE ? createPgPool(config.DATABASE_URL) : undefined;
const auditLogRepository = pool ? createPgAuditLogRepository(pool) : undefined;
const app = buildApp({
  authRepository: pool ? createPgStudentAuthRepository(pool) : undefined,
  adminAuthRepository: pool ? createPgAdminAuthRepository(pool) : undefined,
  adminBankMappingRepository: pool ? createPgAdminBankMappingRepository(pool) : undefined,
  adminImportJobRepository: pool ? createPgAdminImportJobRepository(pool) : undefined,
  adminImportAllowedRoots: config.ADMIN_IMPORT_ALLOWED_ROOTS,
  adminImportModeEnabled: config.ADMIN_IMPORT_ENABLE_WRITE,
  adminImportRunner: pool ? createPgQuestionBankImportRunner(pool) : undefined,
  adminQuestionReviewRepository: pool ? createPgAdminQuestionReviewRepository(pool) : undefined,
  adminStudentRepository: pool ? createPgAdminStudentRepository(pool) : undefined,
  adminSystemStatusRepository: pool ? createPgAdminSystemStatusRepository(pool) : undefined,
  adminUserRepository: pool ? createPgAdminUserRepository(pool) : undefined,
  bankRepository: pool ? createPgBankRepository(pool) : undefined,
  learningRepository: pool ? createPgLearningDashboardRepository(pool) : undefined,
  practiceRepository: pool ? createPgPracticeRepository(pool) : undefined,
  practiceSessionService: pool ? createPgPracticeSessionService(pool) : undefined,
  wrongQuestionRepository: pool ? createPgWrongQuestionRepository(pool) : undefined,
  sessionService: pool
    ? createSessionService(createPgStudentSessionRepository(pool), { ttlDays: config.SESSION_TTL_DAYS })
    : undefined,
  adminSessionService: pool
    ? createAdminSessionService(createPgAdminSessionRepository(pool), { ttlHours: config.ADMIN_SESSION_TTL_HOURS })
    : undefined,
  auditLogRepository,
  auditService: auditLogRepository ? createAuditService(auditLogRepository) : undefined,
  cookieSecret: config.COOKIE_SECRET,
  cookieSecure: config.COOKIE_SECURE,
  sessionTtlDays: config.SESSION_TTL_DAYS,
  adminSessionTtlHours: config.ADMIN_SESSION_TTL_HOURS,
  readinessProbe: pool ? createPgReadinessProbe(pool) : undefined,
  rateLimit: {
    enabled: config.RATE_LIMIT_ENABLED,
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX,
  },
  csrfOriginCheck: {
    enabled: config.CSRF_ORIGIN_CHECK_ENABLED,
    allowedOrigins: config.CSRF_ALLOWED_ORIGINS,
  },
});

if (pool) {
  app.addHook('onClose', async () => {
    await pool.end();
  });

  const close = async () => {
    await app.close();
  };

  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
}

await app.listen({ host: '127.0.0.1', port: config.PORT });
