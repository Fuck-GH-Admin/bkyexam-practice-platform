import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SessionStudent } from '../auth/session.js';
import { CompletedSessionError, type PracticeRepository } from '../practice/repository.js';

const objectiveQuestionTypes = ['single_choice', 'multiple_choice', 'yes_no'];
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const legacyUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    app.get('/api/practice/sessions/active', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      return practiceRepository.listActiveSessions({ studentId: student.id });
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

    app.patch('/api/practice/sessions/:sessionId/progress', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { sessionId } = request.params as { sessionId?: unknown };
      if (!isCanonicalUuid(sessionId)) {
        return reply.status(400).send({ error: 'sessionId must be a valid UUID' });
      }

      const validation = parseSaveProgressRequest(request.body);
      if (!validation.ok) {
        return reply.status(400).send({ error: validation.error });
      }

      try {
        const result = await practiceRepository.saveProgress({
          studentId: student.id,
          sessionId,
          currentSort: validation.value.currentSort,
        });
        if (!result) {
          return reply.status(404).send({ error: 'Practice session not found' });
        }

        return result;
      } catch (error) {
        if (error instanceof CompletedSessionError) {
          return reply.status(409).send({ error: 'Practice session is completed' });
        }

        throw error;
      }
    });

    app.put('/api/practice/sessions/:sessionId/drafts/:questionId', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const ids = parseSessionQuestionParams(request.params);
      if (!ids.ok) {
        return reply.status(400).send({ error: ids.error });
      }

      const validation = parseSaveDraftRequest(request.body);
      if (!validation.ok) {
        return reply.status(400).send({ error: validation.error });
      }

      try {
        const result = await practiceRepository.saveDraft({
          studentId: student.id,
          sessionId: ids.value.sessionId,
          questionId: ids.value.questionId,
          answer: validation.value.answer,
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

    app.delete('/api/practice/sessions/:sessionId/drafts/:questionId', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const ids = parseSessionQuestionParams(request.params);
      if (!ids.ok) {
        return reply.status(400).send({ error: ids.error });
      }

      try {
        const result = await practiceRepository.clearDraft({
          studentId: student.id,
          sessionId: ids.value.sessionId,
          questionId: ids.value.questionId,
        });
        if (!result) {
          return reply.status(404).send({ error: 'Practice session question not found' });
        }

        return reply.status(204).send();
      } catch (error) {
        if (error instanceof CompletedSessionError) {
          return reply.status(409).send({ error: 'Practice session is completed' });
        }

        throw error;
      }
    });

    app.patch('/api/practice/sessions/:sessionId/review/:questionId', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const ids = parseSessionQuestionParams(request.params);
      if (!ids.ok) {
        return reply.status(400).send({ error: ids.error });
      }

      const validation = parseSetReviewFlagRequest(request.body);
      if (!validation.ok) {
        return reply.status(400).send({ error: validation.error });
      }

      try {
        const result = await practiceRepository.setReviewFlag({
          studentId: student.id,
          sessionId: ids.value.sessionId,
          questionId: ids.value.questionId,
          markedForReview: validation.value.markedForReview,
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

    app.post('/api/practice/sessions/:sessionId/submit', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { sessionId } = request.params as { sessionId?: unknown };
      if (!isCanonicalUuid(sessionId)) {
        return reply.status(400).send({ error: 'sessionId must be a valid UUID' });
      }

      try {
        const result = await practiceRepository.submitSession({ studentId: student.id, sessionId });
        if (!result) {
          return reply.status(404).send({ error: 'Practice session not found' });
        }

        return result;
      } catch (error) {
        if (error instanceof CompletedSessionError) {
          return reply.status(409).send({ error: 'Practice session is completed' });
        }

        throw error;
      }
    });

    app.post('/api/practice/sessions/:sessionId/answers', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { sessionId } = request.params as { sessionId?: unknown };
      if (!isLegacyUuid(sessionId)) {
        return reply.status(400).send({ error: 'sessionId must be a valid UUID' });
      }

      const validation = parseSubmitAnswerRequest(request.body, isLegacyUuid);
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

type SaveProgressRequest = {
  currentSort: number;
};

type SaveDraftRequest = {
  answer: SubmitAnswerRequest['answer'];
};

type SetReviewFlagRequest = {
  markedForReview: boolean;
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

function parseSubmitAnswerRequest(body: unknown, isValidUuid = isCanonicalUuid):
  | { ok: true; value: SubmitAnswerRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const input = body as { questionId?: unknown; answer?: unknown };
  if (!isValidUuid(input.questionId)) {
    return { ok: false, error: 'questionId must be a valid UUID' };
  }

  if (!isSubmittedAnswer(input.answer)) {
    return { ok: false, error: 'answer must be a string, boolean, or string array' };
  }

  return { ok: true, value: { questionId: input.questionId, answer: input.answer } };
}

function parseSaveProgressRequest(body: unknown):
  | { ok: true; value: SaveProgressRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const input = body as { currentSort?: unknown };
  if (typeof input.currentSort !== 'number' || !Number.isInteger(input.currentSort) || input.currentSort < 1 || input.currentSort > 200) {
    return { ok: false, error: 'currentSort must be an integer between 1 and 200' };
  }

  return { ok: true, value: { currentSort: input.currentSort } };
}

function parseSaveDraftRequest(body: unknown):
  | { ok: true; value: SaveDraftRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const input = body as { answer?: unknown };
  if (!isSubmittedAnswer(input.answer)) {
    return { ok: false, error: 'answer must be a string, boolean, or string array' };
  }

  return { ok: true, value: { answer: input.answer } };
}

function parseSetReviewFlagRequest(body: unknown):
  | { ok: true; value: SetReviewFlagRequest }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body is required' };
  }

  const input = body as { markedForReview?: unknown };
  if (typeof input.markedForReview !== 'boolean') {
    return { ok: false, error: 'markedForReview must be a boolean' };
  }

  return { ok: true, value: { markedForReview: input.markedForReview } };
}

function parseSessionQuestionParams(params: unknown):
  | { ok: true; value: { sessionId: string; questionId: string } }
  | { ok: false; error: string } {
  const { sessionId, questionId } = params as { sessionId?: unknown; questionId?: unknown };
  if (!isCanonicalUuid(sessionId)) {
    return { ok: false, error: 'sessionId must be a valid UUID' };
  }
  if (!isCanonicalUuid(questionId)) {
    return { ok: false, error: 'questionId must be a valid UUID' };
  }

  return { ok: true, value: { sessionId, questionId } };
}

function isSubmittedAnswer(answer: unknown): answer is SubmitAnswerRequest['answer'] {
  return typeof answer === 'string'
    || typeof answer === 'boolean'
    || (Array.isArray(answer) && answer.every((value) => typeof value === 'string'));
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && canonicalUuidPattern.test(value);
}

function isLegacyUuid(value: unknown): value is string {
  return typeof value === 'string' && legacyUuidPattern.test(value);
}
