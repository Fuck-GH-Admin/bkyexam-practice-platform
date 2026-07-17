import { randomUUID } from 'node:crypto';
import type { LearningGoalSettingsV1, LearningReviewMarkV1 } from '@bkyexam-practice/shared';
import type { LearningDashboardRepository, MemoryDashboard, MemoryTrends } from './types.js';
import {
  buildLearningGoalsResponse,
  cloneGoalSettings,
  defaultGoalSettings,
  emptyDashboard,
  emptyGoalActivityFacts,
  emptyTrendResponse,
  toLowerUuid,
} from './utils.js';

export function createMemoryLearningDashboardRepository(
  dashboards: Record<string, MemoryDashboard> = {},
  trends: Record<string, MemoryTrends> = {},
  goals: Record<string, LearningGoalSettingsV1> = {},
  reviewMarks: Array<LearningReviewMarkV1 & { studentId: string }> = [],
): LearningDashboardRepository {
  const goalSettingsByStudent = new Map(Object.entries(goals).map(([studentId, settings]) => [
    studentId,
    cloneGoalSettings(settings),
  ]));
  const marks = reviewMarks.map((mark) => ({ ...mark }));

  return {
    async getDashboard({ studentId, recentLimit, now = new Date() }) {
      const dashboard = dashboards[studentId] ?? emptyDashboard();

      return {
        generatedAt: dashboard.generatedAt ?? now.toISOString(),
        summary: { ...dashboard.summary },
        recentBanks: dashboard.recentBanks.slice(0, recentLimit).map((bank) => ({ ...bank })),
        questionTypes: dashboard.questionTypes.map((stat) => ({ ...stat })),
        wrongbook: { ...dashboard.wrongbook },
      };
    },
    async getTrends({ studentId, days, now = new Date() }) {
      const trend = trends[studentId];
      if (!trend) return emptyTrendResponse(days, now);

      return {
        generatedAt: trend.generatedAt ?? now.toISOString(),
        fromDate: trend.fromDate,
        toDate: trend.toDate,
        days: trend.days,
        daily: trend.daily.map((day) => ({ ...day })),
        summary: { ...trend.summary },
      };
    },
    async getGoals({ studentId, now = new Date() }) {
      return buildLearningGoalsResponse(
        goalSettingsByStudent.get(studentId) ?? defaultGoalSettings(),
        emptyGoalActivityFacts(now),
        now,
      );
    },
    async updateGoals({ studentId, goals: changes, now = new Date() }) {
      const existing = goalSettingsByStudent.get(studentId) ?? defaultGoalSettings();
      const updated: LearningGoalSettingsV1 = {
        ...existing,
        ...changes,
        source: 'student',
        updatedAt: now.toISOString(),
      };
      goalSettingsByStudent.set(studentId, cloneGoalSettings(updated));

      return buildLearningGoalsResponse(updated, emptyGoalActivityFacts(now), now);
    },
    async listReviewMarks({ studentId, bankId, kind, limit, offset }) {
      const filtered = marks
        .filter((mark) => mark.studentId === studentId)
        .filter((mark) => !bankId || mark.bankId === toLowerUuid(bankId))
        .filter((mark) => kind === 'all'
          || (kind === 'favorite' && mark.favorite)
          || (kind === 'long_term_review' && mark.longTermReview))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
      const page = filtered.slice(offset, offset + limit + 1);

      return {
        reviewMarks: page.slice(0, limit).map(({ studentId: _studentId, ...mark }) => ({ ...mark })),
        page: { limit, offset, hasMore: page.length > limit },
      };
    },
    async upsertReviewMark({ studentId, mark, now = new Date() }) {
      const existing = marks.find((candidate) => (
        candidate.studentId === studentId
        && candidate.questionId === toLowerUuid(mark.questionId)
        && candidate.bankId === toLowerUuid(mark.bankId)
      ));
      const timestamp = now.toISOString();
      if (existing) {
        existing.favorite = mark.favorite;
        existing.longTermReview = mark.longTermReview;
        existing.note = mark.note;
        existing.source = mark.source;
        existing.updatedAt = timestamp;
        const { studentId: _studentId, ...updated } = existing;
        return { ...updated };
      }

      const created: LearningReviewMarkV1 & { studentId: string } = {
        studentId,
        id: randomUUID(),
        questionId: toLowerUuid(mark.questionId),
        bankId: toLowerUuid(mark.bankId),
        bankName: 'Unknown Bank',
        subjectCategory: 'Unknown',
        subjectName: 'Unknown',
        questionType: 'unknown',
        contentPreview: '',
        favorite: mark.favorite,
        longTermReview: mark.longTermReview,
        note: mark.note,
        source: mark.source,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      marks.push(created);
      const { studentId: _studentId, ...reviewMark } = created;
      return { ...reviewMark };
    },
    async deleteReviewMark({ studentId, id }) {
      const index = marks.findIndex((mark) => mark.studentId === studentId && mark.id === toLowerUuid(id));
      if (index < 0) return false;
      marks.splice(index, 1);
      return true;
    },
  };
}
