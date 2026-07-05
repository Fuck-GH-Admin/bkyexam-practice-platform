import type { FastifyInstance, FastifyRequest } from 'fastify';
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

      return { wrongQuestions };
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

      return { success: true };
    });
  };
}

function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}
