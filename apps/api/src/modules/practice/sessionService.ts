import { randomUUID } from 'node:crypto';
import type { QueryClient } from '../../db/client.js';

interface QueryRows<T> {
  rows: T[];
}

type TransactionClient = QueryClient & { release?: () => void };

interface ConnectableQueryClient extends QueryClient {
  connect(): Promise<TransactionClient>;
}

export interface CreatePracticeSessionFromQuestionIdsInput {
  studentId: string;
  bankId: string;
  questionIds: string[];
  mode: 'random' | 'sequential';
  origin: 'bank' | 'wrongbook';
}

export interface PracticeSessionCreationResult {
  sessionId: string;
  questionCount: number;
}

export interface PracticeSessionService {
  createSessionFromQuestionIds(
    input: CreatePracticeSessionFromQuestionIdsInput,
  ): Promise<PracticeSessionCreationResult | null>;
}

export function createMemoryPracticeSessionService(): PracticeSessionService {
  return {
    async createSessionFromQuestionIds(input) {
      if (input.questionIds.length === 0) {
        return null;
      }

      return { sessionId: randomUUID(), questionCount: input.questionIds.length };
    },
  };
}

export function createPgPracticeSessionService(client: QueryClient): PracticeSessionService {
  return {
    async createSessionFromQuestionIds(input) {
      if (input.questionIds.length === 0) {
        return null;
      }

      const transactionClient = await checkoutTransactionClient(client);
      let transactionStarted = false;

      try {
        await transactionClient.query('BEGIN');
        transactionStarted = true;

        const sessionId = randomUUID();
        const sessionResult = (await transactionClient.query(
          `
            INSERT INTO practice_sessions (id, student_id, bank_id, mode, question_limit, question_count, completed_count, correct_count, status, origin)
            VALUES ($1, $2, $3, $4, $5, $5, 0, 0, 'active', $6)
            RETURNING id
          `,
          [sessionId, input.studentId, input.bankId, input.mode, input.questionIds.length, input.origin],
        )) as QueryRows<{ id: string }>;

        const values = input.questionIds.map((_, index) => `($1, $${index + 2}, ${index + 1})`).join(', ');
        await transactionClient.query(
          `
            INSERT INTO practice_session_questions (session_id, question_id, sort)
            VALUES ${values}
          `,
          [sessionResult.rows[0].id, ...input.questionIds],
        );

        await transactionClient.query('COMMIT');

        return { sessionId: sessionResult.rows[0].id, questionCount: input.questionIds.length };
      } catch (error) {
        if (transactionStarted) {
          await transactionClient.query('ROLLBACK');
        }

        throw error;
      } finally {
        transactionClient.release?.();
      }
    },
  };
}

async function checkoutTransactionClient(client: QueryClient): Promise<TransactionClient> {
  return isConnectableQueryClient(client) ? client.connect() : client;
}

function isConnectableQueryClient(client: QueryClient): client is ConnectableQueryClient {
  return 'connect' in client && typeof client.connect === 'function';
}
