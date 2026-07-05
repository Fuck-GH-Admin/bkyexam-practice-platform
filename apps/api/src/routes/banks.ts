import type { FastifyInstance } from 'fastify';

export interface BankListItem {
  bankId: string;
  bankName: string;
  subjectCategory: string;
  subjectName: string;
  visible: boolean;
  status: string;
  keywords: string[];
  questionCount: number;
  description: string;
}

export interface BankRepository {
  listBanks(filters: { category?: string; keyword?: string }): Promise<BankListItem[]>;
}

const seedBanks: BankListItem[] = [
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
  {
    bankId: 'structural-hidden',
    bankName: '结构力学隐藏题库',
    subjectCategory: '土木工程',
    subjectName: '结构力学',
    visible: false,
    status: 'draft',
    keywords: ['结构力学', 'engineering'],
    questionCount: 40,
    description: 'Hidden seed bank used to verify visibility filtering.',
  },
];

function includesInsensitive(value: string, keyword: string) {
  return value.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

export function createMemoryBankRepository(banks: BankListItem[] = seedBanks): BankRepository {
  return {
    async listBanks(filters) {
      return banks.filter((bank) => {
        if (!bank.visible) {
          return false;
        }

        if (filters.category && bank.subjectCategory !== filters.category) {
          return false;
        }

        if (!filters.keyword) {
          return true;
        }

        return [bank.bankName, bank.subjectName, bank.subjectCategory, ...bank.keywords].some((value) =>
          includesInsensitive(value, filters.keyword as string),
        );
      });
    },
  };
}

export function createBankRoutes(repository: BankRepository) {
  return async function registerBankRoutes(app: FastifyInstance) {
    app.get('/api/banks', async (request) => {
      const query = request.query as { category?: unknown; keyword?: unknown };
      const category = typeof query.category === 'string' && query.category.trim() ? query.category : undefined;
      const keyword = typeof query.keyword === 'string' && query.keyword.trim() ? query.keyword : undefined;

      const banks = await repository.listBanks({ category, keyword });
      return { banks };
    });
  };
}

export const registerBankRoutes = createBankRoutes(createMemoryBankRepository());
