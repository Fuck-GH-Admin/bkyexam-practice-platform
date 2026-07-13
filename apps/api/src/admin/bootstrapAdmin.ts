import { createAuditService, createPgAuditLogRepository } from './audit.js';
import {
  createAdminBootstrapService,
  createPgAdminBootstrapRepository,
} from './bootstrap.js';
import { loadConfig } from '../config.js';
import { createPgPool } from '../db/client.js';

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function printResult(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

const config = loadConfig();
const pool = createPgPool(config.DATABASE_URL);

try {
  const repository = createPgAdminBootstrapRepository(pool);
  const auditRepository = createPgAuditLogRepository(pool);
  const service = createAdminBootstrapService(repository, createAuditService(auditRepository));
  const result = await service.bootstrapSuperAdmin({
    loginName: requiredEnv('ADMIN_BOOTSTRAP_LOGIN_NAME'),
    displayName: requiredEnv('ADMIN_BOOTSTRAP_DISPLAY_NAME'),
    password: requiredEnv('ADMIN_BOOTSTRAP_PASSWORD'),
  });

  printResult(result);
  if (result.status !== 'created') {
    process.exitCode = 2;
  }
} catch (error) {
  console.error(JSON.stringify({
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
