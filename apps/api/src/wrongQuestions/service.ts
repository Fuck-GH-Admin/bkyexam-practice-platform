import type { PracticeSessionCreationResult, PracticeSessionService } from '../modules/practice/sessionService.js';
import type { WrongQuestionRepository } from './repository.js';

export interface WrongQuestionService {
  createReviewSession(input: {
    studentId: string;
    bankId?: string;
    includeMastered: boolean;
    limit: number;
  }): Promise<PracticeSessionCreationResult | null>;
}

export function createWrongQuestionService(input: {
  wrongQuestionRepository: WrongQuestionRepository;
  practiceSessionService: PracticeSessionService;
}): WrongQuestionService {
  const { wrongQuestionRepository, practiceSessionService } = input;

  return {
    async createReviewSession(request) {
      const candidates = await wrongQuestionRepository.listReviewCandidates(request);
      if (candidates.length === 0) {
        return null;
      }

      return practiceSessionService.createSessionFromQuestionIds({
        studentId: request.studentId,
        bankId: candidates[0].bankId,
        questionIds: candidates.map((candidate) => candidate.questionId),
        mode: 'sequential',
        origin: 'wrongbook',
      });
    },
  };
}
