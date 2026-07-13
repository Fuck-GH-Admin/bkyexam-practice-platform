import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import type { BankRepository } from '../../src/routes/banks';

describe('bank explorer route', () => {
  it('returns visible bank list', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/banks' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      banks: [
        {
          bankId: 'english-basic',
          bankName: '考研英语基础题库',
          subjectCategory: '英语',
          subjectName: '考研英语',
          visible: true,
          status: 'published',
          keywords: ['英语', '阅读'],
          questionCount: 120,
          description: 'Phase 2 seed bank for English practice.',
        },
        {
          bankId: 'python-basic',
          bankName: 'Python 编程基础题库',
          subjectCategory: '信息技术',
          subjectName: 'Python',
          visible: true,
          status: 'published',
          keywords: ['Python', 'programming'],
          questionCount: 80,
          description: 'Phase 2 seed bank for Python practice.',
        },
      ],
    });
  });

  it('filters banks by category', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/banks?category=英语' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      banks: [
        expect.objectContaining({
          bankId: 'english-basic',
          subjectCategory: '英语',
        }),
      ],
    });
  });

  it('filters banks by keyword or bank name', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/banks?keyword=Python' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      banks: [
        expect.objectContaining({
          bankId: 'python-basic',
          bankName: 'Python 编程基础题库',
        }),
      ],
    });
  });

  it('does not return hidden banks', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/api/banks?keyword=结构力学' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ banks: [] });
  });

  it('fails closed when a repository returns a hidden student catalog item', async () => {
    const bankRepository: BankRepository = {
      async listBanks() {
        return [{
          bankId: 'hidden-bank',
          bankName: '隐藏题库',
          subjectCategory: '信息技术',
          subjectName: '安全边界',
          visible: false,
          status: 'hidden',
          keywords: [],
          questionCount: 1,
          description: 'Should not be returned from the student catalog.',
        }];
      },
    };
    const app = buildApp({ bankRepository });

    const response = await app.inject({ method: 'GET', url: '/api/banks' });

    expect(response.statusCode).toBe(500);
  });
});
