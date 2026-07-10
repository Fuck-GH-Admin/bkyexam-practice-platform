export type PracticeOption = {
  id: string;
  sort: number;
  content: string;
};

export type SavedAnswer = string[] | boolean;

export type PracticeQuestion = {
  id: string;
  sort: number;
  type: string;
  content: string;
  options: PracticeOption[];
  answered: boolean;
  draftAnswer?: SavedAnswer;
  markedForReview?: boolean;
  isCorrect?: boolean | null;
  correctAnswer?: string[] | boolean | string;
  needsSelfReview?: boolean;
};

export type PracticeSession = {
  id: string;
  bankId: string;
  mode: 'random' | 'sequential';
  questionCount: number;
  completedCount: number;
  correctCount: number;
  status: 'active' | 'completed';
  currentSort?: number;
};

export type PracticePayload = {
  session: PracticeSession;
  questions: PracticeQuestion[];
};

export type AnswerResult = {
  questionId: string;
  isCorrect: boolean | null;
  correctAnswer: string[] | boolean | string;
  needsSelfReview: boolean;
};

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export type QuestionStatus = 'current' | 'answered' | 'unanswered' | 'flagged' | 'mixed';

export const practiceSections = [
  { type: 'single_choice', label: '单选题' },
  { type: 'multiple_choice', label: '多选题' },
  { type: 'yes_no', label: '判断题' },
] as const;

export function hasSubmittedAnswer(answer: SavedAnswer | undefined) {
  if (Array.isArray(answer)) return answer.length > 0;
  return answer !== undefined;
}

export function groupQuestionsByType(questions: PracticeQuestion[]) {
  return practiceSections
    .map((section) => ({ ...section, questions: questions.filter((question) => question.type === section.type) }))
    .filter((section) => section.questions.length > 0);
}

export function getAnsweredCount(questions: PracticeQuestion[], answersByQuestion: Record<string, SavedAnswer>) {
  return questions.filter((question) => hasSubmittedAnswer(answersByQuestion[question.id])).length;
}

export function getUnansweredCount(questions: PracticeQuestion[], answersByQuestion: Record<string, SavedAnswer>) {
  return questions.length - getAnsweredCount(questions, answersByQuestion);
}

export function getQuestionState(
  question: PracticeQuestion,
  answersByQuestion: Record<string, SavedAnswer>,
  reviewFlags: Record<string, boolean>,
) {
  const answered = hasSubmittedAnswer(answersByQuestion[question.id]);
  const review = reviewFlags[question.id] === true;
  if (answered && review) return 'answered-review';
  if (answered) return 'answered';
  if (review) return 'review';
  return 'empty';
}

export function buildQuestionStatus(input: { current: boolean; answered: boolean; flagged: boolean }): QuestionStatus {
  if (input.current) return 'current';
  if (input.answered && input.flagged) return 'mixed';
  if (input.flagged) return 'flagged';
  if (input.answered) return 'answered';
  return 'unanswered';
}

export function buildPracticeCheckSummary(
  questions: PracticeQuestion[],
  answersByQuestion: Record<string, SavedAnswer>,
  reviewFlags: Record<string, boolean>,
) {
  const unanswered = questions.filter((question) => !hasSubmittedAnswer(answersByQuestion[question.id]));
  const flagged = questions.filter((question) => reviewFlags[question.id] === true);

  return {
    total: questions.length,
    answeredCount: questions.length - unanswered.length,
    unansweredCount: unanswered.length,
    flaggedCount: flagged.length,
    unanswered,
    flagged,
  };
}

export function buildSectionScores(questions: PracticeQuestion[], resultsByQuestion: Record<string, AnswerResult>) {
  return groupQuestionsByType(questions).map((section) => ({
    type: section.type,
    label: section.label,
    correctCount: section.questions.filter((question) => resultsByQuestion[question.id]?.isCorrect === true).length,
    totalCount: section.questions.length,
  }));
}

export function hydrateAnswersFromQuestions(questions: PracticeQuestion[]) {
  return questions.reduce<Record<string, SavedAnswer>>((answers, question) => {
    if (question.draftAnswer !== undefined) {
      answers[question.id] = question.draftAnswer;
    }
    return answers;
  }, {});
}

export function hydrateReviewFlagsFromQuestions(questions: PracticeQuestion[]) {
  return questions.reduce<Record<string, boolean>>((flags, question) => {
    if (question.markedForReview) {
      flags[question.id] = true;
    }
    return flags;
  }, {});
}

export function buildResultsFromQuestions(questions: PracticeQuestion[]) {
  return questions.reduce<Record<string, AnswerResult>>((items, question) => {
    if (question.isCorrect !== undefined && question.isCorrect !== null) {
      items[question.id] = {
        questionId: question.id,
        isCorrect: question.isCorrect,
        correctAnswer: question.correctAnswer ?? [],
        needsSelfReview: question.needsSelfReview ?? false,
      };
    }
    return items;
  }, {});
}

export function getFirstSectionType(questions: PracticeQuestion[]) {
  return groupQuestionsByType(questions)[0]?.type ?? '';
}

export function getInitialQuestionIndex(questions: PracticeQuestion[], currentSort?: number) {
  if (currentSort === undefined) return 0;
  const index = questions.findIndex((question) => question.sort === currentSort);
  return index >= 0 ? index : 0;
}

export function buildQuestionTypeLabel(type: string) {
  if (type === 'single_choice') return { short: '单选', long: '单选题' };
  if (type === 'multiple_choice') return { short: '多选', long: '多选题' };
  if (type === 'yes_no') return { short: '判断', long: '判断题' };
  if (type === 'fill_blank') return { short: '填空', long: '填空题' };
  if (type === 'essay') return { short: '简答', long: '简答题' };
  if (type === 'code') return { short: '代码', long: '代码题' };
  return { short: type, long: type };
}

export function formatSavedAnswer(answer: SavedAnswer | undefined, options: PracticeOption[] = []) {
  if (answer === undefined || (Array.isArray(answer) && answer.length === 0)) return '未答';
  if (typeof answer === 'boolean') return answer ? '正确' : '错误';

  const optionsById = new Map(options.map((option) => [option.id, option]));
  const labels = answer.map((item) => {
    const option = optionsById.get(item);
    if (!option) return item;
    const content = option.content.replace(/\s+/g, ' ').trim();
    return content ? `${option.sort}. ${content}` : `选项 ${option.sort}`;
  });
  return labels.join(options.length > 0 ? '；' : '、');
}

export function formatCorrectAnswer(answer: AnswerResult['correctAnswer'], options: PracticeOption[] = []) {
  if (Array.isArray(answer)) {
    const optionsById = new Map(options.map((option) => [option.id, option.content || option.id]));
    return answer.map((item) => optionsById.get(item) ?? item).join('、');
  }
  if (typeof answer === 'boolean') return answer ? '正确' : '错误';
  return String(answer);
}
