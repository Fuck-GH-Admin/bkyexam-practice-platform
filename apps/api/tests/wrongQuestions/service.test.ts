import { describe, expect, it } from 'vitest';
import type { PracticeSessionService } from '../../src/modules/practice/sessionService';
import type { WrongQuestionRepository } from '../../src/wrongQuestions/repository';
import { createWrongQuestionService } from '../../src/wrongQuestions/service';

function createFakeWrongQuestionRepository(candidates: Array<{ questionId: string; bankId: string }>) {
  const listReviewCandidateRequests: Parameters<WrongQuestionRepository['listReviewCandidates']>[0][] = [];
  const repository: WrongQuestionRepository = {
    async list() {
      return [];
    },
    async getDetail() {
      return null;
    },
    async listReviewCandidates(input) {
      listReviewCandidateRequests.push(input);
      return candidates;
    },
    async markMastered() {
      return false;
    },
  };

  return { repository, listReviewCandidateRequests };
}

function createFakePracticeSessionService() {
  const createSessionFromQuestionIdsRequests: Parameters<PracticeSessionService['createSessionFromQuestionIds']>[0][] = [];
  const service: PracticeSessionService = {
    async createSessionFromQuestionIds(input) {
      createSessionFromQuestionIdsRequests.push(input);
      return { sessionId: 'session-1', questionCount: input.questionIds.length };
    },
  };

  return { service, createSessionFromQuestionIdsRequests };
}

describe('createWrongQuestionService', () => {
  it('creates wrongbook review sessions through the Practice session service boundary', async () => {
    const { repository, listReviewCandidateRequests } = createFakeWrongQuestionRepository([
      { questionId: 'question-1', bankId: 'bank-1' },
      { questionId: 'question-2', bankId: 'bank-2' },
    ]);
    const { service: practiceSessionService, createSessionFromQuestionIdsRequests } = createFakePracticeSessionService();
    const service = createWrongQuestionService({ wrongQuestionRepository: repository, practiceSessionService });

    const result = await service.createReviewSession({
      studentId: 'student-1',
      bankId: 'bank-filter',
      includeMastered: true,
      limit: 20,
    });

    expect(listReviewCandidateRequests).toEqual([
      { studentId: 'student-1', bankId: 'bank-filter', includeMastered: true, limit: 20 },
    ]);
    expect(createSessionFromQuestionIdsRequests).toEqual([
      {
        studentId: 'student-1',
        bankId: 'bank-1',
        questionIds: ['question-1', 'question-2'],
        mode: 'sequential',
        origin: 'wrongbook',
      },
    ]);
    expect(result).toEqual({ sessionId: 'session-1', questionCount: 2 });
  });

  it('returns null without touching Practice when no wrong questions match', async () => {
    const { repository } = createFakeWrongQuestionRepository([]);
    const { service: practiceSessionService, createSessionFromQuestionIdsRequests } = createFakePracticeSessionService();
    const service = createWrongQuestionService({ wrongQuestionRepository: repository, practiceSessionService });

    const result = await service.createReviewSession({
      studentId: 'student-1',
      includeMastered: false,
      limit: 20,
    });

    expect(result).toBeNull();
    expect(createSessionFromQuestionIdsRequests).toEqual([]);
  });
});
