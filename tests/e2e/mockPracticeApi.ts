import type { Page, Route } from '@playwright/test';

export type MockAnswer = string[] | boolean;

export type MockOption = {
  id: string;
  sort: number;
  content: string;
};

export type MockQuestion = {
  id: string;
  sort: number;
  type: 'single_choice' | 'multiple_choice' | 'yes_no';
  content: string;
  options: MockOption[];
  answered: boolean;
  draftAnswer?: MockAnswer;
  markedForReview: boolean;
  isCorrect?: boolean | null;
  correctAnswer?: string[] | boolean;
  needsSelfReview?: boolean;
};

export type MockWrongQuestion = {
  id: string;
  questionId: string;
  bankId: string;
  bankName: string;
  subjectCategory: string;
  subjectName: string;
  questionType: string;
  contentPreview: string;
  wrongCount: number;
  lastAnswer: string;
  mastered: boolean;
  lastWrongAt: string;
};

export type MockPracticeState = {
  session: {
    id: string;
    bankId: string;
    mode: 'sequential';
    questionCount: number;
    completedCount: number;
    correctCount: number;
    currentSort: number;
    status: 'active' | 'completed';
  };
  questions: MockQuestion[];
  correctAnswers: Map<string, MockAnswer>;
  wrongQuestions: MockWrongQuestion[];
  calls: string[];
};

export const bankId = '11111111-1111-4111-8111-111111111111';
export const sessionId = '22222222-2222-4222-8222-222222222222';
export const alternateSessionId = '66666666-6666-4666-8666-666666666666';

function questionId(index: number) {
  return `33333333-3333-4333-8333-3333333333${String(index).padStart(2, '0')}`;
}

function optionId(index: number) {
  return `44444444-4444-4444-8444-4444444444${String(index).padStart(2, '0')}`;
}

function option(index: number, sort: number, content: string): MockOption {
  return { id: optionId(index), sort, content };
}

function question(
  index: number,
  type: MockQuestion['type'],
  content: string,
  options: MockOption[],
  extra: Partial<MockQuestion> = {},
): MockQuestion {
  return {
    id: questionId(index),
    sort: index,
    type,
    content,
    options,
    answered: false,
    markedForReview: false,
    ...extra,
  };
}

export function createMockPracticeState(): MockPracticeState {
  const questions = [
    question(1, 'single_choice', '操作系统负责管理计算机的哪些核心资源？', [
      option(1, 1, '处理器、内存与外设'),
      option(2, 2, '只管理浏览器窗口'),
      option(3, 3, '只管理键盘输入'),
    ], { draftAnswer: [optionId(1)] }),
    question(2, 'single_choice', '下列哪一种数据结构遵循先进先出原则？', [
      option(11, 1, '栈'),
      option(12, 2, '队列'),
      option(13, 3, '树'),
    ], { markedForReview: true }),
    question(3, 'single_choice', 'HTTP 状态码 404 通常表示什么？', [
      option(21, 1, '请求成功'),
      option(22, 2, '资源未找到'),
      option(23, 3, '服务永久关闭'),
    ]),
    question(4, 'multiple_choice', '以下哪些属于关系型数据库常见能力？', [
      option(31, 1, '事务'),
      option(32, 2, '表与关系'),
      option(33, 3, 'SQL 查询'),
    ], { draftAnswer: [optionId(31), optionId(33)] }),
    question(5, 'multiple_choice', '编写可维护代码时通常应关注哪些方面？', [
      option(41, 1, '明确命名'),
      option(42, 2, '自动化测试'),
      option(43, 3, '模块边界'),
    ]),
    question(6, 'yes_no', '在 JavaScript 中，false 也是一个已经作答的布尔值。', [], {
      draftAnswer: false,
    }),
    question(7, 'yes_no', '提交整套练习后仍应允许继续修改草稿。', []),
  ];

  return {
    session: {
      id: sessionId,
      bankId,
      mode: 'sequential',
      questionCount: questions.length,
      completedCount: 0,
      correctCount: 0,
      currentSort: 2,
      status: 'active',
    },
    questions,
    correctAnswers: new Map<string, MockAnswer>([
      [questionId(1), [optionId(1)]],
      [questionId(2), [optionId(12)]],
      [questionId(3), [optionId(22)]],
      [questionId(4), [optionId(31), optionId(32), optionId(33)]],
      [questionId(5), [optionId(41), optionId(42), optionId(43)]],
      [questionId(6), true],
      [questionId(7), false],
    ]),
    wrongQuestions: [],
    calls: [],
  };
}

export async function installMockPracticeApi(page: Page, state: MockPracticeState) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();
    state.calls.push(`${method} ${pathname}`);

    if (method === 'GET' && pathname === '/api/auth/me') {
      return fulfillJson(route, {
        student: { id: 'student-1', loginName: 'qa_student', displayName: '稳定性测试用户' },
      });
    }
    if (method === 'POST' && pathname === '/api/auth/login') {
      return fulfillJson(route, {
        student: { id: 'student-1', loginName: 'qa_student', displayName: '稳定性测试用户' },
      });
    }
    if (method === 'POST' && pathname === '/api/auth/logout') {
      return fulfillJson(route, { success: true });
    }
    if (method === 'GET' && pathname === '/api/banks') {
      return fulfillJson(route, {
        banks: [{
          bankId,
          bankName: '信息技术综合练习',
          subjectCategory: '信息技术',
          subjectName: '计算机基础',
          visible: true,
          status: 'active',
          keywords: ['操作系统', '数据库', '网络'],
          questionCount: state.questions.length,
          description: '浏览器稳定性测试题库',
        }],
      });
    }
    if (method === 'GET' && pathname === '/api/practice/sessions') {
      const status = url.searchParams.get('status');
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const primary = buildPrimarySessionCard(state);
      const alternate = {
        id: alternateSessionId,
        bankId,
        bankName: '错题巩固练习',
        origin: 'wrongbook',
        mode: 'sequential',
        questionCount: 5,
        answeredCount: 2,
        correctCount: 0,
        reviewCount: 1,
        currentSort: 2,
        status: 'active',
        createdAt: '2026-07-11T08:00:00.000Z',
        updatedAt: '2026-07-11T09:00:00.000Z',
        completedAt: null,
      };
      const sessions = status === 'active'
        ? [...(state.session.status === 'active' ? [primary] : []), alternate]
        : status === 'completed' && state.session.status === 'completed'
          ? [primary]
          : [];
      const pageItems = sessions.slice(offset, offset + limit + 1);
      return fulfillJson(route, {
        sessions: pageItems.slice(0, limit),
        page: { limit, offset, hasMore: pageItems.length > limit },
      });
    }
    if (method === 'GET' && pathname === '/api/practice/sessions/active') {
      return fulfillJson(route, state.session.status === 'active' ? [state.session] : []);
    }
    if (method === 'GET' && pathname === `/api/practice/sessions/${sessionId}`) {
      return fulfillJson(route, { session: state.session, questions: state.questions });
    }
    if (method === 'PATCH' && pathname === `/api/practice/sessions/${sessionId}/progress`) {
      state.session.currentSort = readBody<{ currentSort: number }>(route).currentSort;
      return fulfillJson(route, state.session);
    }
    if (method === 'PUT' && pathname.startsWith(`/api/practice/sessions/${sessionId}/drafts/`)) {
      const target = findQuestionFromPath(state, pathname);
      target.draftAnswer = readBody<{ answer: MockAnswer }>(route).answer;
      return fulfillJson(route, target);
    }
    if (method === 'DELETE' && pathname.startsWith(`/api/practice/sessions/${sessionId}/drafts/`)) {
      const target = findQuestionFromPath(state, pathname);
      delete target.draftAnswer;
      return route.fulfill({ status: 204 });
    }
    if (method === 'PATCH' && pathname.startsWith(`/api/practice/sessions/${sessionId}/review/`)) {
      const target = findQuestionFromPath(state, pathname);
      target.markedForReview = readBody<{ markedForReview: boolean }>(route).markedForReview;
      return fulfillJson(route, target);
    }
    if (method === 'POST' && pathname === `/api/practice/sessions/${sessionId}/submit`) {
      return fulfillJson(route, submitPractice(state));
    }
    if (method === 'GET' && pathname === '/api/wrong-questions') {
      return fulfillJson(route, { wrongQuestions: state.wrongQuestions });
    }
    if (method === 'GET' && pathname.startsWith('/api/wrong-questions/')) {
      const wrongId = pathname.split('/').at(-1);
      const wrongQuestion = state.wrongQuestions.find((item) => item.id === wrongId);
      if (!wrongQuestion) return fulfillJson(route, { error: 'Wrong question not found' }, 404);
      const source = state.questions.find((item) => item.id === wrongQuestion.questionId)!;
      return fulfillJson(route, {
        wrongQuestion: {
          ...wrongQuestion,
          content: source.content,
          options: source.options,
          correctAnswer: state.correctAnswers.get(source.id) ?? '',
          analysis: '这是浏览器 E2E 使用的稳定解析文本。',
        },
      });
    }
    if (method === 'POST' && pathname.endsWith('/mastered')) {
      const wrongId = pathname.split('/').at(-2);
      const wrongQuestion = state.wrongQuestions.find((item) => item.id === wrongId);
      if (!wrongQuestion) return fulfillJson(route, { error: 'Wrong question not found' }, 404);
      wrongQuestion.mastered = true;
      return fulfillJson(route, { success: true });
    }

    return fulfillJson(route, { error: `Unhandled mock route: ${method} ${pathname}` }, 500);
  });
}

function buildPrimarySessionCard(state: MockPracticeState) {
  return {
    id: state.session.id,
    bankId: state.session.bankId,
    bankName: '信息技术综合练习',
    origin: 'bank',
    mode: state.session.mode,
    questionCount: state.session.questionCount,
    answeredCount: state.session.status === 'completed'
      ? state.session.completedCount
      : state.questions.filter((question) => question.answered || hasAnswer(question.draftAnswer)).length,
    correctCount: state.session.correctCount,
    reviewCount: state.questions.filter((question) => question.markedForReview).length,
    currentSort: state.session.currentSort,
    status: state.session.status,
    createdAt: '2026-07-11T09:30:00.000Z',
    updatedAt: '2026-07-11T10:00:00.000Z',
    completedAt: state.session.status === 'completed' ? '2026-07-11T10:30:00.000Z' : null,
  };
}

function submitPractice(state: MockPracticeState) {
  const results = state.questions.flatMap((question) => {
    if (!hasAnswer(question.draftAnswer)) return [];
    const correctAnswer = state.correctAnswers.get(question.id) ?? [];
    const isCorrect = answersEqual(question.draftAnswer, correctAnswer);
    question.answered = true;
    question.isCorrect = isCorrect;
    question.correctAnswer = correctAnswer;
    question.needsSelfReview = false;
    return [{
      questionId: question.id,
      isCorrect,
      correctAnswer,
      needsSelfReview: false,
    }];
  });

  state.session.completedCount = results.length;
  state.session.correctCount = results.filter((result) => result.isCorrect).length;
  state.session.status = 'completed';
  state.wrongQuestions = results
    .filter((result) => !result.isCorrect)
    .map((result, index) => {
      const source = state.questions.find((question) => question.id === result.questionId)!;
      return {
        id: `55555555-5555-4555-8555-5555555555${String(index + 1).padStart(2, '0')}`,
        questionId: source.id,
        bankId,
        bankName: '信息技术综合练习',
        subjectCategory: '信息技术',
        subjectName: '计算机基础',
        questionType: source.type,
        contentPreview: source.content,
        wrongCount: 1,
        lastAnswer: serializeAnswer(source.draftAnswer!),
        mastered: false,
        lastWrongAt: '2026-07-10T12:00:00.000Z',
      };
    });

  return { session: state.session, results };
}

function findQuestionFromPath(state: MockPracticeState, pathname: string) {
  const id = pathname.split('/').at(-1);
  const target = state.questions.find((item) => item.id === id);
  if (!target) throw new Error(`Mock question not found: ${id}`);
  return target;
}

function readBody<T>(route: Route): T {
  return route.request().postDataJSON() as T;
}

function hasAnswer(answer: MockAnswer | undefined): answer is MockAnswer {
  if (answer === undefined) return false;
  return !Array.isArray(answer) || answer.length > 0;
}

function answersEqual(actual: MockAnswer, expected: MockAnswer) {
  if (typeof actual === 'boolean' || typeof expected === 'boolean') return actual === expected;
  return [...actual].sort().join('|') === [...expected].sort().join('|');
}

function serializeAnswer(answer: MockAnswer) {
  return Array.isArray(answer) ? JSON.stringify(answer) : String(answer);
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}
