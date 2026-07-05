import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SessionStudent } from '../auth/session.js';
import { CompletedSessionError, type PracticeRepository } from '../practice/repository.js';

const objectiveQuestionTypes = ['single_choice', 'multiple_choice', 'yes_no'];
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PracticeRoutesOptions {
  practiceRepository: PracticeRepository;
  requireStudent: (request: FastifyRequest) => Promise<SessionStudent | null>;
}

export function createPracticeRoutes({ practiceRepository, requireStudent }: PracticeRoutesOptions) {
  return async function registerPracticeRoutes(app: FastifyInstance) {
    app.post('/api/practice/sessions', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const validation = parseCreateSessionRequest(request.body);
      if (!validation.ok) {
        return reply.status(400).send({ error: validation.error });
      }

      const result = await practiceRepository.createSession({ studentId: student.id, ...validation.value });
      if (!result) {
        return reply.status(404).send({ error: 'Question bank not found' });
      }

      return result;
    });

    app.get('/api/practice/sessions/:sessionId', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { sessionId } = request.params as { sessionId?: unknown };
      if (!isCanonicalUuid(sessionId)) {
        return reply.status(400).send({ error: 'sessionId must be a valid UUID' });
      }

      const result = await practiceRepository.getSession({ studentId: student.id, sessionId });
      if (!result) {
        return reply.status(404).send({ error: 'Practice session not found' });
      }

      return result;
    });

    app.post('/api/practice/sessions/:sessionId/answers', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { sessionId } = request.params as { sessionId?: unknown };
      if (!isCanonicalUuid(sessionId)) {
        return reply.status(400).send({ error: 'sessionId must be a valid UUID' });
      }

      const validation = parseSubmitAnswerRequest(request.body);
      if (!validation.ok) {
        return reply.status(400).send({ error: validation.error });
      }

      try {
        const result = await practiceRepository.submitAnswer({
          studentId: student.id,
          sessionId,
          ...validation.value,
        });
        if (!result) {
          return reply.status(404).send({ error: 'Practice session question not found' });
        }

        return result;
      } catch (error) {
        if (error instanceof CompletedSessionError) {
          return reply.status(409).send({ error: 'Practice session is completed' });
        }

        throw error;
      }
    });
  };
}

type CreateSessionRequest = {
  bankId: string;
  mode: 'random' | 'sequential';
  limit: number;
  questionTypes: string[];
};

type SubmitAnswerRequest = {
  questionId: string;
  answer: string[] | boolean | string;
};

function parseCreateSessionRequest(body: unknown):
  | { ok: true; value: CreateSessionRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const input = body as {
    bankId?: unknown;
    mode?: unknown;
    limit?: unknown;
    questionTypes?: unknown;
  };

  if (!isCanonicalUuid(input.bankId)) {
    return { ok: false, error: 'bankId must be a valid UUID' };
  }

  const mode = input.mode ?? 'random';
  if (mode !== 'random' && mode !== 'sequential') {
    return { ok: false, error: 'mode must be random or sequential' };
  }

  const limit = input.limit === undefined ? 70 : input.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    return { ok: false, error: 'limit must be an integer between 1 and 200' };
  }

  const questionTypes = input.questionTypes ?? objectiveQuestionTypes;
  if (
    !Array.isArray(questionTypes)
    || questionTypes.length === 0
    || !questionTypes.every((type) => typeof type === 'string' && type.trim())
  ) {
    return { ok: false, error: 'questionTypes must be a non-empty string array' };
  }

  return {
    ok: true,
    value: {
      bankId: input.bankId,
      mode,
      limit,
      questionTypes,
    },
  };
}

function parseSubmitAnswerRequest(body: unknown):
  | { ok: true; value: SubmitAnswerRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const input = body as { questionId?: unknown; answer?: unknown };
  if (!isCanonicalUuid(input.questionId)) {
    return { ok: false, error: 'questionId must be a valid UUID' };
  }

  if (!isSubmittedAnswer(input.answer)) {
    return { ok: false, error: 'answer must be a string, boolean, or string array' };
  }

  return { ok: true, value: { questionId: input.questionId, answer: input.answer } };
}

function isSubmittedAnswer(answer: unknown): answer is SubmitAnswerRequest['answer'] {
  return typeof answer === 'string'
    || typeof answer === 'boolean'
    || (Array.isArray(answer) && answer.every((value) => typeof value === 'string'));
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && canonicalUuidPattern.test(value);
}
