import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  GetLearningDashboardRequestV1Schema,
  GetLearningTrendsRequestV1Schema,
  LearningDashboardResponseV1Schema,
  LearningTrendsResponseV1Schema,
} from '@bkyexam-practice/shared';
import type { SessionStudent } from '../auth/session.js';
import type { LearningDashboardRepository } from '../learning/repository.js';

interface LearningRoutesOptions {
  repository: LearningDashboardRepository;
  requireStudent: (request: FastifyRequest) => Promise<SessionStudent | null>;
}

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
  };
}
