import { createPgStudentSessionRepository, createSessionService } from './auth/session.js';
import { createPgStudentAuthRepository } from './auth/studentAuth.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgPool } from './db/client.js';
import { createPgPracticeRepository } from './practice/repository.js';
import { createPgBankRepository } from './repositories/bankRepository.js';
import { createPgWrongQuestionRepository } from './wrongQuestions/repository.js';

const config = loadConfig();
const pool = config.USE_DATABASE ? createPgPool(config.DATABASE_URL) : undefined;
const app = buildApp({
  authRepository: pool ? createPgStudentAuthRepository(pool) : undefined,
  bankRepository: pool ? createPgBankRepository(pool) : undefined,
  practiceRepository: pool ? createPgPracticeRepository(pool) : undefined,
  wrongQuestionRepository: pool ? createPgWrongQuestionRepository(pool) : undefined,
  sessionService: pool
    ? createSessionService(createPgStudentSessionRepository(pool), { ttlDays: config.SESSION_TTL_DAYS })
    : undefined,
  cookieSecret: config.COOKIE_SECRET,
  cookieSecure: config.COOKIE_SECURE,
  sessionTtlDays: config.SESSION_TTL_DAYS,
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
