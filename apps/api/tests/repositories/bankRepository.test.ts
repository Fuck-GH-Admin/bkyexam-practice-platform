import { describe, expect, it } from 'vitest';
import { createPgBankRepository } from '../../src/repositories/bankRepository';
import type { QueryClient } from '../../src/db/client';

class FakeQueryClient implements QueryClient {
  sql = '';
  params: readonly unknown[] | undefined;

  constructor(private readonly rows: unknown[] = []) {}

  async query(sql: string, params?: readonly unknown[]) {
    this.sql = sql;
    this.params = params;

    return { rows: this.rows };
  }
}

describe('createPgBankRepository', () => {
  it('queries only visible active bank mappings', async () => {
    const client = new FakeQueryClient();
    const repository = createPgBankRepository(client);

    await repository.listBanks({});

    expect(client.sql).toContain('FROM bank_mappings');
    expect(client.sql).toContain('visible = true');
    expect(client.sql).toContain("status = 'active'");
  });

  it('parameterizes category filters', async () => {
    const client = new FakeQueryClient();
    const repository = createPgBankRepository(client);

    await repository.listBanks({ category: "English' OR true --" });

    expect(client.sql).toContain('subject_category = $1');
    expect(client.sql).not.toContain("English' OR true --");
    expect(client.params).toEqual(["English' OR true --"]);
  });

  it('parameterizes keyword filters across searchable bank fields', async () => {
    const client = new FakeQueryClient();
    const repository = createPgBankRepository(client);

    await repository.listBanks({ keyword: "Python%' OR true --" });

    expect(client.sql).toContain("lower(bank_name) LIKE $1 ESCAPE '\\'");
    expect(client.sql).toContain("lower(subject_name) LIKE $1 ESCAPE '\\'");
    expect(client.sql).toContain("lower(subject_category) LIKE $1 ESCAPE '\\'");
    expect(client.sql).toContain("lower(keywords::text) LIKE $1 ESCAPE '\\'");
    expect(client.sql).not.toContain("Python%' OR true --");
    expect(client.params).toEqual(["%python\\%' or true --%"]);
  });

  it('escapes LIKE wildcards in keyword filters so percent is searched literally', async () => {
    const client = new FakeQueryClient();
    const repository = createPgBankRepository(client);

    await repository.listBanks({ keyword: '%' });

    expect(client.sql).toContain("LIKE $1 ESCAPE '\\'");
    expect(client.params).toEqual(['%\\%%']);
  });

  it('uses stable placeholder order when category and keyword are both present', async () => {
    const client = new FakeQueryClient();
    const repository = createPgBankRepository(client);

    await repository.listBanks({ category: '信息技术', keyword: 'Python' });

    expect(client.sql).toContain('subject_category = $1');
    expect(client.sql).toContain("lower(bank_name) LIKE $2 ESCAPE '\\'");
    expect(client.sql).toContain("lower(keywords::text) LIKE $2 ESCAPE '\\'");
    expect(client.params).toEqual(['信息技术', '%python%']);
  });

  it('maps snake_case database rows to BankListItem values', async () => {
    const client = new FakeQueryClient([
      {
        bank_id: 'python-basic',
        bank_name: 'Python 编程基础题库',
        subject_category: '信息技术',
        subject_name: 'Python',
        visible: true,
        status: 'active',
        keywords: ['Python', 'programming'],
        question_count: 80,
        description: 'Imported Python bank.',
      },
    ]);
    const repository = createPgBankRepository(client);

    await expect(repository.listBanks({})).resolves.toEqual([
      {
        bankId: 'python-basic',
        bankName: 'Python 编程基础题库',
        subjectCategory: '信息技术',
        subjectName: 'Python',
        visible: true,
        status: 'active',
        keywords: ['Python', 'programming'],
        questionCount: 80,
        description: 'Imported Python bank.',
      },
    ]);
  });

  it('uses objective question counts as the practiceable bank count', async () => {
    const client = new FakeQueryClient([
      {
        bank_id: 'root-bank',
        bank_name: '成都理工',
        subject_category: '信息技术',
        subject_name: '计算机基础',
        visible: true,
        status: 'active',
        keywords: ['计算机基础'],
        question_count: 0,
        objective_question_count: 18491,
        description: 'Imported bank.',
      },
    ]);
    const repository = createPgBankRepository(client);

    const banks = await repository.listBanks({});

    expect(client.sql).toContain('objective_question_count');
    expect(banks[0]?.questionCount).toBe(18491);
  });
});
