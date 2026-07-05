import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { BankRepository } from '../src/routes/banks';

describe('buildApp bank repository wiring', () => {
  it('serves default in-memory banks without a database', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/banks' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      banks: expect.arrayContaining([
        expect.objectContaining({
          bankId: 'english-basic',
          bankName: '考研英语基础题库',
        }),
      ]),
    });
  });

  it('serves banks from an injected repository', async () => {
    const bankRepository: BankRepository = {
      async listBanks() {
        return [
          {
            bankId: 'pg-bank',
            bankName: 'PostgreSQL Backed Bank',
            subjectCategory: 'database',
            subjectName: 'PostgreSQL',
            visible: true,
            status: 'active',
            keywords: ['postgres'],
            questionCount: 12,
            description: 'Loaded from the injected repository.',
          },
        ];
      },
    };
    const app = buildApp({ bankRepository });

    const response = await app.inject({ method: 'GET', url: '/api/banks' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      banks: [
        {
          bankId: 'pg-bank',
          bankName: 'PostgreSQL Backed Bank',
          subjectCategory: 'database',
          subjectName: 'PostgreSQL',
          visible: true,
          status: 'active',
          keywords: ['postgres'],
          questionCount: 12,
          description: 'Loaded from the injected repository.',
        },
      ],
    });
  });
});
