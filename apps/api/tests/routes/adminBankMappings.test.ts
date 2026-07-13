import { describe, expect, it } from 'vitest';
import type { AdminBankMappingRepository } from '../../src/admin/bankMappings';
import { createMemoryAdminBankMappingRepository } from '../../src/admin/bankMappings';
import { createAuditService, createMemoryAuditLogRepository } from '../../src/admin/audit';
import { createMemoryAdminAuthRepository } from '../../src/admin/auth';
import { createAdminSessionService } from '../../src/admin/session';
import { hashPassword } from '../../src/auth/password';
import { buildApp } from '../../src/app';
import type { AdminBankMappingDetailV1, ListAdminBankMappingsRequestV1 } from '@bkyexam-practice/shared';

type AdminSessionService = ReturnType<typeof createAdminSessionService>;

const bankId = '10000000-0000-4000-8000-000000000001';

const mapping: AdminBankMappingDetailV1 = {
  bankId,
  rawName: '数据库集成测试题库',
  bankName: '数据库集成测试题库',
  subjectCategory: '质量保障',
  subjectName: 'PostgreSQL',
  parentId: null,
  parentName: null,
  qGroup: 100,
  visible: true,
  status: 'active',
  difficulty: 'mixed',
  examPurpose: 'integration',
  questionTypes: ['single_choice', 'multiple_choice', 'yes_no'],
  audience: 'developers',
  keywords: ['integration', 'postgres'],
  description: '用于真实 PostgreSQL integration profile 的最小题库。',
  notes: '',
  questionCount: 4,
  descendantQuestionCount: 4,
  objectiveQuestionCount: 4,
  questionTypeCounts: { single_choice: 2, multiple_choice: 1, yes_no: 1 },
  studentPreview: {
    visibleInStudentCatalog: true,
    reason: 'visible active bank with objective questions',
  },
  version: 1,
  updatedAt: '2026-07-13T10:00:00.000Z',
  updatedBy: null,
};

async function adminAuthRepository(roles: Array<'content_editor' | 'operator' | 'super_admin'> = ['operator']) {
  return createMemoryAdminAuthRepository([{
    id: '50000000-0000-4000-8000-000000000001',
    loginName: 'operator@example.com',
    displayName: 'Operator',
    passwordHash: await hashPassword('secret'),
    status: 'active',
    roles,
  }]);
}

async function loginAdmin(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/auth/login',
    payload: { loginName: 'operator@example.com', password: 'secret' },
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers['set-cookie']).split(';', 1)[0];
}

describe('admin bank mapping routes', () => {
  it('requires an admin session before listing bank mappings', async () => {
    const app = buildApp({
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([mapping]),
    });

    const response = await app.inject({ method: 'GET', url: '/api/admin/bank-mappings' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  it('lists bank mappings with parsed filters and pagination', async () => {
    let receivedFilters: ListAdminBankMappingsRequestV1 | null = null;
    const repository: AdminBankMappingRepository = {
      async listBankMappings(filters) {
        receivedFilters = filters;
        return {
          bankMappings: [{
            bankId: mapping.bankId,
            rawName: mapping.rawName,
            bankName: mapping.bankName,
            subjectCategory: mapping.subjectCategory,
            subjectName: mapping.subjectName,
            parentId: mapping.parentId,
            qGroup: mapping.qGroup,
            visible: mapping.visible,
            status: mapping.status,
            difficulty: mapping.difficulty,
            examPurpose: mapping.examPurpose,
            questionTypes: mapping.questionTypes,
            audience: mapping.audience,
            keywords: mapping.keywords,
            description: mapping.description,
            notes: mapping.notes,
            questionCount: mapping.questionCount,
            descendantQuestionCount: mapping.descendantQuestionCount,
            objectiveQuestionCount: mapping.objectiveQuestionCount,
            version: mapping.version,
            updatedAt: mapping.updatedAt,
            updatedBy: mapping.updatedBy,
          }],
          page: { limit: filters.limit, offset: filters.offset, hasMore: false },
        };
      },
      async findBankMappingById() {
        return null;
      },
      async updateBankMapping() {
        return { status: 'not_found' };
      },
      async bulkUpdateBankMappingStatus() {
        return { updated: [], failed: [] };
      },
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(),
      adminBankMappingRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/bank-mappings?status=active&visible=true&qGroup=100&hasObjectiveQuestions=true&limit=10&offset=20',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      bankMappings: [{
        bankId: mapping.bankId,
        rawName: mapping.rawName,
        bankName: mapping.bankName,
        subjectCategory: mapping.subjectCategory,
        subjectName: mapping.subjectName,
        parentId: null,
        qGroup: 100,
        visible: true,
        status: 'active',
        difficulty: 'mixed',
        examPurpose: 'integration',
        questionTypes: ['single_choice', 'multiple_choice', 'yes_no'],
        audience: 'developers',
        keywords: ['integration', 'postgres'],
        description: '用于真实 PostgreSQL integration profile 的最小题库。',
        notes: '',
        questionCount: 4,
        descendantQuestionCount: 4,
        objectiveQuestionCount: 4,
        version: 1,
        updatedAt: '2026-07-13T10:00:00.000Z',
        updatedBy: null,
      }],
      page: { limit: 10, offset: 20, hasMore: false },
    });
    expect(receivedFilters).toMatchObject({
      status: 'active',
      visible: true,
      qGroup: 100,
      hasObjectiveQuestions: true,
      limit: 10,
      offset: 20,
    });
  });

  it('returns bank mapping details by id', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([mapping]),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/bank-mappings/${bankId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bankMapping: mapping });
  });

  it('returns 400 for invalid query and invalid bank id', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([mapping]),
    });
    const cookie = await loginAdmin(app);

    const invalidQuery = await app.inject({
      method: 'GET',
      url: '/api/admin/bank-mappings?limit=0',
      headers: { cookie },
    });
    expect(invalidQuery.statusCode).toBe(400);

    const invalidId = await app.inject({
      method: 'GET',
      url: '/api/admin/bank-mappings/not-a-uuid',
      headers: { cookie },
    });
    expect(invalidId.statusCode).toBe(400);
  });

  it('returns 404 for a missing bank mapping detail', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([]),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/bank-mappings/${bankId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Bank mapping not found' });
  });

  it('returns 403 when a valid admin session lacks bank_mapping:read', async () => {
    const forbiddenSessionService: AdminSessionService = {
      async createSession(admin) {
        return { token: `token-for-${admin.id}`, expiresAt: new Date('2030-01-01T00:00:00.000Z') };
      },
      async resolveAdmin(token) {
        if (!token) return null;
        return {
          admin: {
            id: 'admin-1',
            loginName: 'no-access@example.com',
            displayName: 'No Access',
            roles: [],
            permissions: ['admin:self:read'],
          },
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        };
      },
      async revokeSession() {},
    };
    const app = buildApp({ adminSessionService: forbiddenSessionService });

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/bank-mappings',
      headers: { cookie: 'bky_admin_session=token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('updates bank mapping metadata with version checks and audit log', async () => {
    const auditLogRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([mapping]),
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/bank-mappings/${bankId}`,
      headers: { cookie },
      payload: {
        expectedVersion: 1,
        changes: {
          bankName: '更新后的题库名',
          keywords: ['integration', 'postgres', 'admin'],
          notes: '人工确认',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bankMapping: {
        bankId,
        bankName: '更新后的题库名',
        keywords: ['integration', 'postgres', 'admin'],
        notes: '人工确认',
        version: 2,
        updatedBy: {
          id: '50000000-0000-4000-8000-000000000001',
          displayName: 'Operator',
        },
      },
    });
    expect(auditLogRepository.entries).toHaveLength(2);
    expect(auditLogRepository.entries[1]).toMatchObject({
      actorAdminId: '50000000-0000-4000-8000-000000000001',
      action: 'bank_mapping.update',
      resourceType: 'bank_mapping',
      resourceId: bankId,
      before: {
        bankName: '数据库集成测试题库',
        keywords: ['integration', 'postgres'],
        notes: '',
      },
      after: {
        bankName: '更新后的题库名',
        keywords: ['integration', 'postgres', 'admin'],
        notes: '人工确认',
      },
      metadata: {
        changedFields: ['bankName', 'keywords', 'notes'],
        beforeVersion: 1,
        afterVersion: 2,
      },
      result: 'success',
    });
  });

  it('returns 409 for stale bank mapping versions', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([mapping]),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/bank-mappings/${bankId}`,
      headers: { cookie },
      payload: {
        expectedVersion: 99,
        changes: { notes: 'stale' },
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'Bank mapping version conflict' });
  });

  it('returns 422 when publishing a visible active bank with no objective questions', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([{
        ...mapping,
        visible: false,
        status: 'review',
        objectiveQuestionCount: 0,
        studentPreview: { visibleInStudentCatalog: false, reason: 'bank hidden' },
      }]),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/bank-mappings/${bankId}`,
      headers: { cookie },
      payload: {
        expectedVersion: 1,
        changes: { visible: true, status: 'active' },
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: 'Cannot publish bank mapping without objective questions' });
  });

  it('returns 403 when updating with a session that lacks bank_mapping:write', async () => {
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['operator']),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([mapping]),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/bank-mappings/${bankId}`,
      headers: { cookie },
      payload: {
        expectedVersion: 1,
        changes: { notes: 'operator should not write' },
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Forbidden' });
  });

  it('bulk-updates bank mapping status with partial failures and per-item audit logs', async () => {
    const secondBankId = '10000000-0000-4000-8000-000000000002';
    const auditLogRepository = createMemoryAuditLogRepository();
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(['content_editor']),
      adminBankMappingRepository: createMemoryAdminBankMappingRepository([
        mapping,
        { ...mapping, bankId: secondBankId, bankName: '第二题库', version: 3 },
      ]),
      auditService: createAuditService(auditLogRepository),
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/bank-mappings/bulk-status',
      headers: { cookie },
      payload: {
        items: [
          { bankId, expectedVersion: 1 },
          { bankId: secondBankId, expectedVersion: 99 },
        ],
        changes: { visible: false, status: 'hidden' },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      updated: [{ bankId, version: 2 }],
      failed: [{ bankId: secondBankId, error: 'Bank mapping version conflict' }],
    });
    expect(auditLogRepository.entries.filter((entry) => entry.action === 'bank_mapping.update')).toHaveLength(1);
    expect(auditLogRepository.entries.at(-1)).toMatchObject({
      resourceId: bankId,
      before: { visible: true, status: 'active' },
      after: { visible: false, status: 'hidden' },
      metadata: { bulk: true, beforeVersion: 1, afterVersion: 2 },
    });
  });

  it('fails closed when a repository returns an invalid admin mapping payload', async () => {
    const repository: AdminBankMappingRepository = {
      async listBankMappings() {
        return {
          bankMappings: [{ ...mapping, status: 'published' } as never],
          page: { limit: 20, offset: 0, hasMore: false },
        };
      },
      async findBankMappingById() {
        return null;
      },
      async updateBankMapping() {
        return { status: 'not_found' };
      },
      async bulkUpdateBankMappingStatus() {
        return { updated: [], failed: [] };
      },
    };
    const app = buildApp({
      adminAuthRepository: await adminAuthRepository(),
      adminBankMappingRepository: repository,
    });
    const cookie = await loginAdmin(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/bank-mappings',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(500);
  });
});
