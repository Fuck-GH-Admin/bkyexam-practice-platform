import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importQuestionBank, runImportCli } from '../../src/import/importQuestionBank.js';
import type { PgPool, QueryClient } from '../../src/db/client.js';
import type { ImportedQuestionBankData } from '../../src/import/loadQuestionBankData.js';

class FakeClient implements QueryClient {
  readonly queries: { sql: string; params?: readonly unknown[] }[] = [];

  constructor(private readonly failOnTable?: string) {}

  async query(sql: string, params?: readonly unknown[]): Promise<unknown> {
    this.queries.push({ sql, params });

    if (this.failOnTable && sql.includes(`INSERT INTO ${this.failOnTable}`)) {
      throw new Error(`failed ${this.failOnTable}`);
    }

    return { rowCount: 0 };
  }
}

describe('importQuestionBank', () => {
  it('wraps writes in BEGIN and COMMIT and returns import counts', async () => {
    const client = new FakeClient();

    const result = await importQuestionBank(client, questionBankData(), { batchSize: 10 });

    expect(result).toEqual({ classifications: 2, questions: 2, options: 3, skippedOptions: 0, bankMappings: 2 });
    expect(client.queries.at(0)?.sql).toBe('BEGIN');
    expect(client.queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('rolls back and rethrows when a write fails', async () => {
    const client = new FakeClient('questions');

    await expect(importQuestionBank(client, questionBankData(), { batchSize: 10 })).rejects.toThrow(
      'failed questions',
    );

    expect(client.queries.map((query) => query.sql)).toContain('ROLLBACK');
    expect(client.queries.map((query) => query.sql)).not.toContain('COMMIT');
  });

  it('inserts classifications before questions, questions before options, and bank mappings before commit', async () => {
    const client = new FakeClient();

    await importQuestionBank(client, questionBankData(), { batchSize: 10 });

    const writes = client.queries.map((query) => query.sql);
    const classificationIndex = writes.findIndex((sql) => sql.includes('INSERT INTO classifications'));
    const questionIndex = writes.findIndex((sql) => sql.includes('INSERT INTO questions'));
    const optionIndex = writes.findIndex((sql) => sql.includes('INSERT INTO question_options'));
    const bankMappingIndex = writes.findIndex((sql) => sql.includes('INSERT INTO bank_mappings'));
    const commitIndex = writes.findIndex((sql) => sql === 'COMMIT');

    expect(classificationIndex).toBeGreaterThan(-1);
    expect(questionIndex).toBeGreaterThan(classificationIndex);
    expect(optionIndex).toBeGreaterThan(questionIndex);
    expect(bankMappingIndex).toBeGreaterThan(optionIndex);
    expect(commitIndex).toBeGreaterThan(bankMappingIndex);
  });

  it('chunks inserts with the configured batch size', async () => {
    const client = new FakeClient();

    await importQuestionBank(client, questionBankData(), { batchSize: 2 });

    const optionInserts = client.queries.filter((query) => query.sql.includes('INSERT INTO question_options'));

    expect(optionInserts).toHaveLength(2);
    expect(optionInserts[0]?.params).toHaveLength(8);
    expect(optionInserts[1]?.params).toHaveLength(4);
  });

  it('skips options whose question is not present in the import data', async () => {
    const client = new FakeClient();
    const data = questionBankData();
    data.options.push({
      id: '20000000-0000-0000-0000-000000000099',
      questionId: '10000000-0000-0000-0000-000000000099',
      sort: 1,
      content: 'Orphan Option',
    });

    const result = await importQuestionBank(client, data, { batchSize: 10 });

    expect(result).toMatchObject({ options: 3, skippedOptions: 1 });
    const optionInsert = client.queries.find((query) => query.sql.includes('INSERT INTO question_options'));

    expect(optionInsert?.params).not.toContain('10000000-0000-0000-0000-000000000099');
    expect(optionInsert?.params).not.toContain('Orphan Option');
  });

  it('skips bank mapping writes when generateMappings is false', async () => {
    const client = new FakeClient();

    const result = await importQuestionBank(client, questionBankData(), {
      batchSize: 10,
      generateMappings: false,
    });

    expect(result).toMatchObject({ bankMappings: 0 });
    expect(client.queries.some((query) => query.sql.includes('INSERT INTO bank_mappings'))).toBe(false);
    expect(client.queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('uses parameterized upserts for imported records', async () => {
    const client = new FakeClient();

    await importQuestionBank(client, questionBankData(), { batchSize: 10 });

    for (const write of client.queries.filter((query) => query.sql.startsWith('INSERT INTO'))) {
      if (write.sql.includes('INSERT INTO bank_mappings')) {
        expect(write.sql).toContain('ON CONFLICT (bank_id) DO UPDATE');
      } else {
        expect(write.sql).toContain('ON CONFLICT (id) DO UPDATE');
      }
      expect(write.sql).toContain('$1');
      expect(write.params?.length).toBeGreaterThan(0);
      expect(write.sql).not.toContain('Classification One');
      expect(write.sql).not.toContain('Question One');
      expect(write.sql).not.toContain('Option One');
    }
  });
});

describe('import package scripts', () => {
  it('runs the database importer CLI from the API package', async () => {
    const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['import:db']).toBe('tsx src/import/importQuestionBank.ts');
  });
});

describe('runImportCli', () => {
  it('checks out and releases one pool client for the import transaction', async () => {
    const client = new FakeClient();
    const pool: PgPool = {
      async connect() {
        return {
          query: (sql, params) => client.query(sql, params),
          release: () => {
            client.queries.push({ sql: 'RELEASE' });
          },
        };
      },
      async end() {
        client.queries.push({ sql: 'END' });
      },
    };

    const result = await runImportCli({
      argv: ['node', 'importQuestionBank.ts', 'questionbank'],
      env: { DATABASE_URL: 'postgres://example' },
      createPool: () => pool,
      loadData: async () => questionBankData(),
      log: () => undefined,
      error: () => undefined,
    });

    expect(result).toBe(0);
    expect(client.queries.at(0)?.sql).toBe('BEGIN');
    expect(client.queries.at(-3)?.sql).toBe('COMMIT');
    expect(client.queries.at(-2)?.sql).toBe('RELEASE');
    expect(client.queries.at(-1)?.sql).toBe('END');
  });
});

function questionBankData(): ImportedQuestionBankData {
  return {
    classifications: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Classification One',
        parentId: null,
        qGroup: 1,
        sort: 1,
        isDeleted: false,
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Classification Two',
        parentId: '00000000-0000-0000-0000-000000000001',
        qGroup: 1,
        sort: 2,
        isDeleted: false,
      },
    ],
    questions: [
      {
        id: '10000000-0000-0000-0000-000000000001',
        classificationId: '00000000-0000-0000-0000-000000000001',
        qType: 1,
        normalizedType: 'single_choice',
        qGroup: 1,
        content: 'Question One',
        answerRaw: '20000000-0000-0000-0000-000000000001',
        analyzeRaw: '',
        useCount: 3,
        difficulty: 0.4,
        searchableText: 'Question One Classification One',
      },
      {
        id: '10000000-0000-0000-0000-000000000002',
        classificationId: '00000000-0000-0000-0000-000000000002',
        qType: 2,
        normalizedType: 'multiple_choice',
        qGroup: 1,
        content: 'Question Two',
        answerRaw: '20000000-0000-0000-0000-000000000003',
        analyzeRaw: 'Analysis Two',
        useCount: 4,
        difficulty: 0.8,
        searchableText: 'Question Two Classification Two',
      },
    ],
    options: [
      {
        id: '20000000-0000-0000-0000-000000000001',
        questionId: '10000000-0000-0000-0000-000000000001',
        sort: 1,
        content: 'Option One',
      },
      {
        id: '20000000-0000-0000-0000-000000000002',
        questionId: '10000000-0000-0000-0000-000000000001',
        sort: 2,
        content: 'Option Two',
      },
      {
        id: '20000000-0000-0000-0000-000000000003',
        questionId: '10000000-0000-0000-0000-000000000002',
        sort: 1,
        content: 'Option Three',
      },
    ],
    summary: {
      classifications: 2,
      questions: 2,
      options: 3,
      questionTypes: {
        single_choice: 1,
        multiple_choice: 1,
      },
    },
  };
}
