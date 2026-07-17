import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  DeleteLearningReviewMarkResponseV1Schema,
  GetLearningDashboardRequestV1Schema,
  GetLearningTrendsRequestV1Schema,
  LearningDashboardResponseV1Schema,
  LearningGoalsResponseV1Schema,
  LearningReviewMarkListResponseV1Schema,
  LearningReviewMarkResponseV1Schema,
  LearningTrendsResponseV1Schema,
  ListLearningReviewMarksRequestV1Schema,
  UpdateLearningGoalsRequestV1Schema,
  UpsertLearningReviewMarkRequestV1Schema,
} from '@bkyexam-practice/shared';
import type { SessionStudent } from '../auth/session.js';
import type { LearningDashboardRepository } from '../learning/repository.js';

interface LearningRoutesOptions {
  repository: LearningDashboardRepository;
  requireStudent: (request: FastifyRequest) => Promise<SessionStudent | null>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createLearningRoutes({ repository, requireStudent }: LearningRoutesOptions) {
  return async function registerLearningRoutes(app: FastifyInstance) {
    app.get('/api/learning/dashboard', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const validation = GetLearningDashboardRequestV1Schema.safeParse(request.query);
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error.issues[0]?.message ?? 'Invalid learning dashboard query',
        });
      }

      const dashboard = await repository.getDashboard({
        studentId: student.id,
        recentLimit: validation.data.recentLimit,
      });

      return LearningDashboardResponseV1Schema.parse(dashboard);
    });

    app.get('/api/learning/trends', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const validation = GetLearningTrendsRequestV1Schema.safeParse(request.query);
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error.issues[0]?.message ?? 'Invalid learning trends query',
        });
      }

      const trends = await repository.getTrends({
        studentId: student.id,
        days: validation.data.days,
      });

      return LearningTrendsResponseV1Schema.parse(trends);
    });

    app.get('/api/learning/goals', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const goals = await repository.getGoals({
        studentId: student.id,
      });

      return LearningGoalsResponseV1Schema.parse(goals);
    });

    app.get('/api/learning/review-marks', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const validation = ListLearningReviewMarksRequestV1Schema.safeParse(request.query);
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error.issues[0]?.message ?? 'Invalid learning review mark query',
        });
      }

      const reviewMarks = await repository.listReviewMarks({
        studentId: student.id,
        bankId: validation.data.bankId,
        kind: validation.data.kind,
        limit: validation.data.limit,
        offset: validation.data.offset,
      });

      return LearningReviewMarkListResponseV1Schema.parse(reviewMarks);
    });

    app.put('/api/learning/review-marks', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const validation = UpsertLearningReviewMarkRequestV1Schema.safeParse(request.body ?? {});
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error.issues[0]?.message ?? 'Invalid learning review mark payload',
        });
      }

      const reviewMark = await repository.upsertReviewMark({
        studentId: student.id,
        mark: validation.data,
      });
      if (!reviewMark) {
        return reply.status(404).send({ error: 'Question not found in bank' });
      }

      return LearningReviewMarkResponseV1Schema.parse({ reviewMark });
    });

    app.delete('/api/learning/review-marks/:id', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const { id } = request.params as { id?: string };
      if (!id || !uuidPattern.test(id)) {
        return reply.status(400).send({ error: 'Invalid review mark id' });
      }

      const deleted = await repository.deleteReviewMark({ studentId: student.id, id });
      if (!deleted) {
        return reply.status(404).send({ error: 'Review mark not found' });
      }

      return DeleteLearningReviewMarkResponseV1Schema.parse({ success: true });
    });

    app.put('/api/learning/goals', async (request, reply) => {
      const student = await requireStudent(request);
      if (!student) {
        return reply.status(401).send({ error: 'Unauthenticated' });
      }

      const validation = UpdateLearningGoalsRequestV1Schema.safeParse(request.body ?? {});
      if (!validation.success) {
        return reply.status(400).send({
          error: validation.error.issues[0]?.message ?? 'Invalid learning goals payload',
        });
      }

      const goals = await repository.updateGoals({
        studentId: student.id,
        goals: validation.data,
      });

      return LearningGoalsResponseV1Schema.parse(goals);
    });
  };
}
