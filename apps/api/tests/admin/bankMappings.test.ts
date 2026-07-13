import { describe, expect, it } from 'vitest';
import {
  createMemoryAdminBankMappingRepository,
  createPgAdminBankMappingRepository,
} from '../../src/admin/bankMappings';
import type { AdminBankMappingDetailV1 } from '@bkyexam-practice/shared';
import type { QueryClient } from '../../src/db/client';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

class FakeQueryClient implements QueryClient {
  queries: RecordedQuery[] = [];

  constructor(private readonly rows: unknown[] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push({ sql, params });
    return { rows: this.rows };
  }
}

const bankId = '10000000-0000-4000-8000-000000000001';
const parentId = '10000000-0000-4000-8000-000000000002';

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
  questionTypes: ['single_choice', 'multiple_choice'],
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

describe('memory admin bank mapping repository', () => {
  it('filters and paginates admin bank mappings without detail-only fields', async () => {
    const repository = createMemoryAdminBankMappingRepository([
      mapping,
      {
        ...mapping,
        bankId: parentId,
        bankName: '隐藏题库',
        visible: false,
        status: 'review',
        objectiveQuestionCount: 0,
        studentPreview: { visibleInStudentCatalog: false, reason: 'bank hidden' },
      },
    ]);

    await expect(repository.listBankMappings({
      status: 'active',
      visible: true,
      keyword: 'postgres',
      hasObjectiveQuestions: true,
      limit: 1,
      offset: 0,
    })).resolves.toEqual({
      bankMappings: [{
        bankId,
        rawName: '数据库集成测试题库',
        bankName: '数据库集成测试题库',
        subjectCategory: '质量保障',
        subjectName: 'PostgreSQL',
        parentId: null,
        qGroup: 100,
        visible: true,
        status: 'active',
        difficulty: 'mixed',
        examPurpose: 'integration',
        questionTypes: ['single_choice', 'multiple_choice'],
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
      page: { limit: 1, offset: 0, hasMore: false },
    });
  });
});

describe('PostgreSQL admin bank mapping repository', () => {
  it('builds parameterized list filters and limit-plus-one pagination', async () => {
    const client = new FakeQueryClient();
    const repository = createPgAdminBankMappingRepository(client);

    await repository.listBankMappings({
      status: 'review',
      visible: false,
      subjectCategory: '质量保障',
      subjectName: 'PostgreSQL',
      keyword: "Postgres%' OR true --",
      qGroup: 100,
      parentId,
      hasObjectiveQuestions: false,
      limit: 20,
      offset: 40,
    });

    const query = client.queries[0];
    expect(query.sql).toContain('FROM bank_mappings');
    expect(query.sql).toContain('bank_mappings.status = $1');
    expect(query.sql).toContain('bank_mappings.visible = $2');
    expect(query.sql).toContain('bank_mappings.subject_category = $3');
    expect(query.sql).toContain('bank_mappings.subject_name = $4');
    expect(query.sql).toContain('bank_mappings.q_group = $5');
    expect(query.sql).toContain('bank_mappings.parent_id = $6');
    expect(query.sql).toContain("lower(bank_mappings.bank_name) LIKE $7 ESCAPE '\\'");
    expect(query.sql).toContain('COALESCE(objective_counts.objective_question_count, 0) = 0');
    expect(query.sql).toContain('LIMIT $8');
    expect(query.sql).toContain('OFFSET $9');
    expect(query.sql).not.toContain("Postgres%' OR true --");
    expect(query.params).toEqual([
      'review',
      false,
      '质量保障',
      'PostgreSQL',
      100,
      parentId,
      "%postgres\\%' or true --%",
      21,
      40,
    ]);
  });

  it('maps list rows and hasMore from the extra fetched row', async () => {
    const client = new FakeQueryClient([
      createPgRow({ bank_id: bankId, bank_name: '第一题库' }),
      createPgRow({ bank_id: parentId, bank_name: '第二题库' }),
    ]);
    const repository = createPgAdminBankMappingRepository(client);

    await expect(repository.listBankMappings({ limit: 1, offset: 0 })).resolves.toMatchObject({
      bankMappings: [{
        bankId,
        bankName: '第一题库',
        objectiveQuestionCount: 4,
        version: 1,
        updatedBy: null,
      }],
      page: { limit: 1, offset: 0, hasMore: true },
    });
  });

  it('loads bank mapping details with parent, type counts, and student preview', async () => {
    const client = new FakeQueryClient([
      createPgRow({
        parent_id: parentId,
        parent_name: '父级题库',
        question_type_counts: { single_choice: 2, multiple_choice: 1 },
      }),
    ]);
    const repository = createPgAdminBankMappingRepository(client);

    await expect(repository.findBankMappingById(bankId)).resolves.toMatchObject({
      bankId,
      parentName: '父级题库',
      questionTypeCounts: { single_choice: 2, multiple_choice: 1 },
      studentPreview: {
        visibleInStudentCatalog: true,
        reason: 'visible active bank with objective questions',
      },
    });

    expect(client.queries[0].sql).toContain('WITH RECURSIVE bank_tree AS');
    expect(client.queries[0].sql).toContain('jsonb_object_agg');
    expect(client.queries[0].params).toEqual([bankId]);
  });
});

function createPgRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    bank_id: bankId,
    raw_name: '数据库集成测试题库',
    bank_name: '数据库集成测试题库',
    subject_category: '质量保障',
    subject_name: 'PostgreSQL',
    parent_id: null,
    parent_name: null,
    q_group: 100,
    visible: true,
    status: 'active',
    difficulty: 'mixed',
    exam_purpose: 'integration',
    question_types: ['single_choice', 'multiple_choice'],
    audience: 'developers',
    keywords: ['integration', 'postgres'],
    description: '用于真实 PostgreSQL integration profile 的最小题库。',
    notes: '',
    question_count: 4,
    descendant_question_count: 4,
    objective_question_count: 4,
    question_type_counts: { single_choice: 2, multiple_choice: 1, yes_no: 1 },
    version: 1,
    updated_at: new Date('2026-07-13T10:00:00.000Z'),
    updated_by_admin_id: null,
    updated_by_display_name: null,
    ...overrides,
  };
}
