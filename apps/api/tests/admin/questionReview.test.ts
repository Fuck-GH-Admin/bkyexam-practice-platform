import { describe, expect, it } from 'vitest';
import {
  createMemoryAdminQuestionReviewRepository,
  createPgAdminQuestionReviewRepository,
} from '../../src/admin/questionReview';
import type { QueryClient } from '../../src/db/client';
import type { AdminQuestionReviewItemV1 } from '@bkyexam-practice/shared';

interface RecordedQuery {
  sql: string;
  params?: readonly unknown[];
}

class FakeQueryClient implements QueryClient {
  queries: RecordedQuery[] = [];

  constructor(private readonly rows: unknown[][] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.queries.push({ sql, params });
    return { rows: this.rows.shift() ?? [] };
  }
}

const adminId = '50000000-0000-4000-8000-000000000001';
const bankId = '10000000-0000-4000-8000-000000000001';
const questionId = '20000000-0000-4000-8000-000000000001';
const flagId = '70000000-0000-4000-8000-000000000001';

const questionReview: AdminQuestionReviewItemV1 = {
  questionId,
  bankId,
  bankName: '数据库集成测试题库',
  questionType: 'single_choice',
  contentPreview: 'PostgreSQL 中哪个命令用于提交当前事务？',
  optionCount: 2,
  answerPreview: 'COMMIT',
  flags: [{
    id: flagId,
    type: 'bad_answer',
    severity: 'high',
    status: 'open',
    note: '答案与解析不一致',
    createdAt: '2026-07-13T10:00:00.000Z',
    createdBy: { id: adminId, displayName: 'Operator' },
    resolvedAt: null,
    resolvedBy: null,
  }],
  excludedFromPractice: false,
};

describe('memory admin question review repository', () => {
  it('lists matching flags and updates question review state', async () => {
    const repository = createMemoryAdminQuestionReviewRepository([questionReview]);

    await expect(repository.listQuestionReviews({
      status: 'open',
      flagType: 'bad_answer',
      severity: 'high',
      keyword: 'PostgreSQL',
      limit: 20,
      offset: 0,
    })).resolves.toMatchObject({
      questions: [{ questionId, flags: [{ id: flagId }] }],
      page: { hasMore: false },
    });

    const result = await repository.updateQuestionReview({
      questionId,
      changes: {
        addFlags: [{ type: 'missing_option', severity: 'blocking', note: '缺少选项' }],
        resolveFlagIds: [flagId],
        ignoredFlagIds: [],
        excludedFromPractice: true,
      },
      actor: { id: adminId, displayName: 'Operator' },
    });

    expect(result).toMatchObject({
      status: 'updated',
      before: { excludedFromPractice: false },
      after: {
        excludedFromPractice: true,
        flags: expect.arrayContaining([
          expect.objectContaining({ id: flagId, status: 'resolved' }),
          expect.objectContaining({ type: 'missing_option', status: 'open' }),
        ]),
      },
      addedFlags: [expect.objectContaining({ type: 'missing_option' })],
      resolvedFlags: [expect.objectContaining({ id: flagId, status: 'resolved' })],
    });
  });
});

describe('PostgreSQL admin question review repository', () => {
  it('lists question reviews with filters and limit-plus-one pagination', async () => {
    const client = new FakeQueryClient([
      [
        createQuestionReviewRow({ question_id: questionId }),
        createQuestionReviewRow({ question_id: '20000000-0000-4000-8000-000000000002' }),
      ],
    ]);
    const repository = createPgAdminQuestionReviewRepository(client);

    await expect(repository.listQuestionReviews({
      bankId,
      questionType: 'single_choice',
      flagType: 'bad_answer',
      status: 'open',
      severity: 'high',
      keyword: 'commit',
      limit: 1,
      offset: 2,
    })).resolves.toMatchObject({
      questions: [{ questionId }],
      page: { limit: 1, offset: 2, hasMore: true },
    });

    expect(client.queries[0].sql).toContain('FROM question_quality_flags');
    expect(client.queries[0].sql).toContain('question_quality_flags.status = $1');
    expect(client.queries[0].sql).toContain('question_quality_flags.flag_type = $2');
    expect(client.queries[0].sql).toContain('question_quality_flags.severity = $3');
    expect(client.queries[0].sql).toContain('question_quality_flags.bank_id = $4');
    expect(client.queries[0].sql).toContain('questions.normalized_type = $5');
    expect(client.queries[0].params).toEqual([
      'open',
      'bad_answer',
      'high',
      bankId,
      'single_choice',
      '%commit%',
      2,
      2,
    ]);
  });
});

function createQuestionReviewRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    question_id: questionId,
    bank_id: bankId,
    bank_name: '数据库集成测试题库',
    question_type: 'single_choice',
    content_preview: 'PostgreSQL 中哪个命令用于提交当前事务？',
    option_count: '2',
    answer_preview: 'COMMIT',
    excluded_from_practice: false,
    flags: [{
      id: flagId,
      type: 'bad_answer',
      severity: 'high',
      status: 'open',
      note: '答案与解析不一致',
      createdAt: '2026-07-13T10:00:00.000Z',
      createdBy: { id: adminId, displayName: 'Operator' },
      resolvedAt: null,
      resolvedBy: null,
    }],
    ...overrides,
  };
}
