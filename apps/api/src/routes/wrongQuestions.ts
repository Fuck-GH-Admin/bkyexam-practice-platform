import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  MarkWrongQuestionMasteredResponseV1Schema,
  WrongQuestionDetailResponseV1Schema,
  WrongQuestionListResponseV1Schema,
  WrongQuestionReviewSessionResponseV1Schema,
} from '@bkyexam-practice/shared';
import type { SessionStudent } from '../auth/session.js';
import type { WrongQuestionRepository } from '../wrongQuestions/repository.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface WrongQuestionRoutesOptions {
  wrongQuestionRepository: WrongQuestionRepository;
  requireStudent: (request: FastifyRequest) => Promise<SessionStudent | null>;
}

export function createWrongQuestionRoutes({ wrongQuestionRepository, requireStudent }: WrongQuestionRoutesOptions) {
  return async function registerWrongQuestionRoutes(app: FastifyInstance) {
    app.get('/api/wrong-questions', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const query = request.query as { bankId?: unknown; includeMastered?: unknown };
      const bankId = typeof query.bankId === 'string' && query.bankId.trim() ? query.bankId : undefined;
      if (bankId && !isUuid(bankId)) {
        return reply.status(400).send({ error: 'bankId must be a valid UUID' });
      }

      const includeMastered = query.includeMastered === 'true';
      const wrongQuestions = await wrongQuestionRepository.list({
        studentId: student.id,
        ...(bankId ? { bankId } : {}),
        includeMastered,
      });

      return WrongQuestionListResponseV1Schema.parse({ wrongQuestions });
    });

    app.post('/api/wrong-questions/review-sessions', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const body = (request.body ?? {}) as { bankId?: unknown; includeMastered?: unknown; limit?: unknown };
      const bankId = typeof body.bankId === 'string' && body.bankId.trim() ? body.bankId : undefined;
      if (bankId && !isUuid(bankId)) {
        return reply.status(400).send({ error: 'bankId must be a valid UUID' });
      }
      const limit = body.limit === undefined ? 20 : Number(body.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        return reply.status(400).send({ error: 'limit must be an integer from 1 through 100' });
      }

      const session = await wrongQuestionRepository.createReviewSession({
        studentId: student.id,
        ...(bankId ? { bankId } : {}),
        includeMastered: body.includeMastered === true,
        limit,
      });
      if (!session) {
        return reply.status(404).send({ error: 'No wrong questions matched the filters' });
      }

      return WrongQuestionReviewSessionResponseV1Schema.parse({
        session: { id: session.sessionId, questionCount: session.questionCount },
      });
    });

    app.get('/api/wrong-questions/:id', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { id } = request.params as { id?: unknown };
      if (typeof id !== 'string' || !id.trim()) {
        return reply.status(404).send({ error: 'Wrong question not found' });
      }
      if (!isUuid(id)) {
        return reply.status(400).send({ error: 'id must be a valid UUID' });
      }

      const wrongQuestion = await wrongQuestionRepository.getDetail({ studentId: student.id, id });
      if (!wrongQuestion) {
        return reply.status(404).send({ error: 'Wrong question not found' });
      }

      return WrongQuestionDetailResponseV1Schema.parse({ wrongQuestion });
    });

    app.post('/api/wrong-questions/:id/mastered', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { id } = request.params as { id?: unknown };
      if (typeof id !== 'string' || !id.trim()) {
        return reply.status(404).send({ error: 'Wrong question not found' });
      }
      if (!isUuid(id)) {
        return reply.status(400).send({ error: 'id must be a valid UUID' });
      }

      const marked = await wrongQuestionRepository.markMastered({ studentId: student.id, id });
      if (!marked) {
        return reply.status(404).send({ error: 'Wrong question not found' });
      }

      return MarkWrongQuestionMasteredResponseV1Schema.parse({ success: true });
    });
  };
}

function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}
