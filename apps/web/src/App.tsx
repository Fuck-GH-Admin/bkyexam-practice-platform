import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiErrorResponseV1Schema,
  AuthLoginResponseV1Schema,
  AuthLogoutResponseV1Schema,
  AuthMeResponseV1Schema,
  CatalogBankListResponseV1Schema,
  ChangeStudentPasswordResponseV1Schema,
  MarkWrongQuestionMasteredResponseV1Schema,
  ObjectivePracticeQuestionTypesV1,
  PracticePayloadV1Schema,
  PracticeQuestionV1Schema,
  PracticeSessionPageV1Schema,
  PracticeSessionV1Schema,
  PracticeSubmitSessionResponseV1Schema,
  WrongQuestionDetailResponseV1Schema,
  WrongQuestionListResponseV1Schema,
  WrongQuestionReviewSessionResponseV1Schema,
  type AuthStudentV1,
  type CatalogBankV1,
  type PracticeSessionCardV1,
  type WrongQuestionDetailV1,
  type WrongQuestionItemV1,
} from '@bkyexam-practice/shared';

import { buildStudentPath, parseStudentRoute, type StudentRoute } from './app/router';
import { PracticeDesk } from './features/practice/PracticeDesk';
import { SubmitCheckDialog } from './features/practice/SubmitCheckDialog';
import { PracticeHistory } from './features/sessions/PracticeHistory';
import { StudentHome } from './features/sessions/StudentHome';
import {
  buildResultsFromQuestions,
  buildSectionScores,
  formatCorrectAnswer,
  getAnsweredCount,
  getFirstSectionType,
  getInitialQuestionIndex,
  getUnansweredCount,
  groupQuestionsByType,
  hasSubmittedAnswer,
  hydrateAnswersFromQuestions,
  hydrateReviewFlagsFromQuestions,
  type AnswerResult,
  type PracticeOption,
  type PracticePayload,
  type PracticeQuestion,
  type PracticeSession,
  type SavedAnswer,
  type SaveStatus,
} from './features/practice/model';

export {
  buildPracticeCheckSummary,
  buildQuestionStatus,
  buildQuestionTypeLabel,
  buildResultsFromQuestions,
  buildSectionScores,
  formatCorrectAnswer,
  formatSavedAnswer,
  getAnsweredCount,
  getFirstSectionType,
  getInitialQuestionIndex,
  getQuestionState,
  getUnansweredCount,
  groupQuestionsByType,
  hasSubmittedAnswer,
  hydrateAnswersFromQuestions,
  hydrateReviewFlagsFromQuestions,
} from './features/practice/model';

type Student = AuthStudentV1;
type Bank = CatalogBankV1;
type WrongQuestion = WrongQuestionItemV1;
type WrongQuestionDetail = WrongQuestionDetailV1;

const objectiveTypes = [...ObjectivePracticeQuestionTypesV1];

export function getVisibleChips(subjectName: string, keywords: string[]) {
  return Array.from(new Set([subjectName, ...keywords].filter(Boolean))).slice(0, 4);
}

export function getFilterOptions(banks: Bank[]) {
  return Array.from(
    new Set(banks.flatMap((bank) => [bank.subjectCategory, bank.subjectName]).filter(Boolean)),
  ).sort(compareFilterLabels);
}

function compareFilterLabels(first: string, second: string) {
  const firstAscii = /^[\x00-\x7F]/.test(first);
  const secondAscii = /^[\x00-\x7F]/.test(second);
  if (firstAscii !== secondAscii) return firstAscii ? -1 : 1;
  return first.localeCompare(second, 'zh-Hans-CN');
}

export function filterBanks(banks: Bank[], filters: { category: string; keyword: string }) {
  const category = filters.category.trim();
  const keyword = filters.keyword.trim().toLocaleLowerCase();

  return banks.filter((bank) => {
    if (category && bank.subjectCategory !== category && bank.subjectName !== category) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return [bank.bankName, bank.subjectName, bank.subjectCategory, bank.description, ...bank.keywords]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase().includes(keyword));
  });
}

export function formatStoredAnswer(answer: string, options: PracticeOption[] = []) {
  try {
    const parsed = JSON.parse(answer) as unknown;
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return '未作答';

      const values = parsed.map(String);
      const rendered = values.map((value) => options.find((option) => option.id === value)?.content ?? value);
      if (rendered.some((value) => isCanonicalUuid(value))) {
        return `已选择 ${values.length} 项`;
      }

      return rendered.join('、');
    }

    if (typeof parsed === 'boolean') return parsed ? '正确' : '错误';
    if (typeof parsed === 'string') {
      const option = options.find((candidate) => candidate.id === parsed);
      if (option) return option.content;
      return isCanonicalUuid(parsed) ? '已作答' : parsed;
    }
    if (parsed == null) return '未作答';
    return String(parsed);
  } catch {
    return answer;
  }
}

export function buildWrongbookStats(items: Array<{ mastered: boolean; lastWrongAt: string }>) {
  const latestWrongAt = items
    .map((item) => item.lastWrongAt)
    .sort()
    .at(-1) ?? '';
  return {
    total: items.length,
    active: items.filter((item) => !item.mastered).length,
    mastered: items.filter((item) => item.mastered).length,
    latestWrongAt,
  };
}

export function validatePasswordChangeForm(fields: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  if (!fields.currentPassword.trim()) return '请输入当前密码。';
  if (fields.newPassword.length < 8) return '新密码至少需要 8 位。';
  if (fields.newPassword !== fields.confirmPassword) return '两次输入的新密码不一致。';
  if (fields.currentPassword === fields.newPassword) return '新密码不能和当前密码相同。';
  return '';
}

export function buildStudentIdentityMeta(student: Student, passwordResetRequired: boolean) {
  return [
    `账号：${student.loginName}`,
    `姓名：${student.displayName}`,
    student.className ? `班级：${student.className}` : '',
    student.groupName ? `分组：${student.groupName}` : '',
    passwordResetRequired ? '状态：待首次改密' : '状态：已启用',
  ].filter(Boolean);
}

async function api<T>(
  path: string,
  options: RequestInit = {},
  parse?: (body: unknown) => T,
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = ApiErrorResponseV1Schema.safeParse(body);
    throw new Error(error.success ? error.data.error : `请求失败：${response.status}`);
  }

  return parse ? parse(body) : body as T;
}

function isCanonicalUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function App() {
  const [student, setStudent] = useState<Student | null>(null);
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [activeSessions, setActiveSessions] = useState<PracticeSessionCardV1[]>([]);
  const [historySessions, setHistorySessions] = useState<PracticeSessionCardV1[]>([]);
  const [activeSessionsLoading, setActiveSessionsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [category, setCategory] = useState('');
  const [keyword, setKeyword] = useState('');
  const [mode, setMode] = useState<'random' | 'sequential'>('random');
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeSectionType, setActiveSectionType] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [yesNoAnswer, setYesNoAnswer] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [answersByQuestion, setAnswersByQuestion] = useState<Record<string, SavedAnswer>>({});
  const [resultsByQuestion, setResultsByQuestion] = useState<Record<string, AnswerResult>>({});
  const [reviewFlags, setReviewFlags] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveStatus>('idle');
  const [submitCheckOpen, setSubmitCheckOpen] = useState(false);
  const [sessionResults, setSessionResults] = useState<Record<string, AnswerResult>>({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [wrongBankId, setWrongBankId] = useState('');
  const [includeMastered, setIncludeMastered] = useState(false);
  const [selectedWrongId, setSelectedWrongId] = useState('');
  const [wrongDetail, setWrongDetail] = useState<WrongQuestionDetail | null>(null);
  const [wrongDetailLoading, setWrongDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [route, setRoute] = useState<StudentRoute>(() => parseStudentRoute(
    typeof window === 'undefined' ? '/' : window.location.pathname,
  ));
  const draftSaveChainRef = useRef(Promise.resolve());
  const progressSaveChainRef = useRef(Promise.resolve());
  const draftSaveFailedRef = useRef(false);
  const currentSessionIdRef = useRef('');
  const practiceRequestRef = useRef(0);
  const postActivationRouteRef = useRef<StudentRoute | null>(null);

  const filterOptions = useMemo(
    () => getFilterOptions(banks),
    [banks],
  );
  const filteredBanks = useMemo(() => filterBanks(banks, { category, keyword }), [banks, category, keyword]);
  const currentQuestion = questions[currentIndex];
  const sections = useMemo(() => groupQuestionsByType(questions), [questions]);
  const answeredCount = getAnsweredCount(questions, answersByQuestion);
  const unansweredCount = getUnansweredCount(questions, answersByQuestion);
  const isCompleted = session?.status === 'completed';
  const sectionScores = isCompleted ? buildSectionScores(questions, resultsByQuestion) : [];
  const saveStatusText = saveState === 'saving'
    ? '保存中...'
    : saveState === 'saved'
      ? '草稿已保存'
      : saveState === 'failed'
        ? '草稿保存失败，稍后会重试'
        : '';
  const filteredWrongQuestions = useMemo(
    () => wrongQuestions.filter((item) => !wrongBankId || item.bankId === wrongBankId),
    [wrongQuestions, wrongBankId],
  );
  const wrongStats = useMemo(() => buildWrongbookStats(filteredWrongQuestions), [filteredWrongQuestions]);
  const view = route.view;
  const studentIdentityMeta = student ? buildStudentIdentityMeta(student, passwordResetRequired) : [];

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const normalizedPath = buildStudentPath(parseStudentRoute(window.location.pathname));
    if (normalizedPath !== window.location.pathname) {
      window.history.replaceState({}, '', normalizedPath);
    }

    const handlePopState = () => {
      setMessage('');
      setRoute(parseStudentRoute(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (student) {
      void loadBanks();
      void loadWrongQuestions({ includeMastered });
    }
  }, [student, includeMastered]);

  useEffect(() => {
    if (!student) return;

    if (passwordResetRequired && route.view !== 'accountPassword') {
      postActivationRouteRef.current = route;
      setMessage('请先修改临时密码后继续使用。');
      navigateTo({ view: 'accountPassword' }, { replace: true, keepMessage: true });
      return;
    }

    if (route.view === 'accountPassword') {
      practiceRequestRef.current += 1;
      setPracticeLoading(false);
      return;
    }

    if (route.view !== 'practice') {
      practiceRequestRef.current += 1;
      setPracticeLoading(false);
    }

    if (route.view === 'home') {
      void loadActiveSessions();
      return;
    }
    if (route.view === 'history') {
      void loadHistorySessions();
      return;
    }
    if (route.view === 'wrong') {
      void loadWrongQuestions({ includeMastered, bankId: wrongBankId });
      return;
    }
    if (route.view === 'practice') {
      if (currentSessionIdRef.current === route.sessionId) return;
      void loadPracticeSession(route.sessionId);
      return;
    }
  }, [student, passwordResetRequired, route, includeMastered, wrongBankId]);

  useEffect(() => {
    if (view !== 'wrong') return;
    const first = filteredWrongQuestions[0];
    if (!first) {
      setSelectedWrongId('');
      setWrongDetail(null);
      return;
    }
    if (!selectedWrongId || !filteredWrongQuestions.some((item) => item.id === selectedWrongId)) {
      void loadWrongQuestionDetail(first.id);
    }
  }, [view, filteredWrongQuestions, selectedWrongId]);

  async function restoreSession() {
    try {
      const result = await api('/api/auth/me', {}, (body) => AuthMeResponseV1Schema.parse(body));
      setStudent(result.student);
      setPasswordResetRequired(result.passwordResetRequired ?? false);
    } catch {
      setStudent(null);
      setPasswordResetRequired(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      const result = await api(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ loginName, password }),
        },
        (body) => AuthLoginResponseV1Schema.parse(body),
      );
      setStudent(result.student);
      setPasswordResetRequired(result.passwordResetRequired ?? false);
      setLoginName('');
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }, (body) => AuthLogoutResponseV1Schema.parse(body));
    setStudent(null);
    setPasswordResetRequired(false);
    setSession(null);
    setQuestions([]);
    setActiveSessions([]);
    setHistorySessions([]);
    setPracticeLoading(false);
    setAnswersByQuestion({});
    setReviewFlags({});
    setSessionResults({});
    setUserMenuOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    postActivationRouteRef.current = null;
    practiceRequestRef.current += 1;
    currentSessionIdRef.current = '';
    navigateTo({ view: 'home' }, { replace: true });
  }

  async function changeStudentPassword(event: FormEvent) {
    event.preventDefault();
    const validationError = validatePasswordChangeForm({ currentPassword, newPassword, confirmPassword });
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setMessage('');
    setLoading(true);
    try {
      await api(
        '/api/auth/password/change',
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        },
        (body) => ChangeStudentPasswordResponseV1Schema.parse(body),
      );
      const me = await api('/api/auth/me', {}, (body) => AuthMeResponseV1Schema.parse(body));
      setStudent(me.student);
      setPasswordResetRequired(me.passwordResetRequired ?? false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      const nextRoute = postActivationRouteRef.current ?? { view: 'home' as const };
      postActivationRouteRef.current = null;
      setMessage('密码已更新，可以继续使用。');
      navigateTo(nextRoute, { replace: true, keepMessage: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '密码修改失败');
    } finally {
      setLoading(false);
    }
  }

  function navigateTo(nextRoute: StudentRoute, options: { replace?: boolean; keepMessage?: boolean } = {}) {
    if (typeof window !== 'undefined') {
      const path = buildStudentPath(nextRoute);
      if (options.replace) {
        window.history.replaceState({}, '', path);
      } else if (window.location.pathname !== path) {
        window.history.pushState({}, '', path);
      }
    }
    if (!options.keepMessage) setMessage('');
    setUserMenuOpen(false);
    setRoute(nextRoute);
  }

  function applyPracticePayload(payload: PracticePayload) {
    const answers = hydrateAnswersFromQuestions(payload.questions);
    const results = buildResultsFromQuestions(payload.questions);
    const nextIndex = getInitialQuestionIndex(payload.questions, payload.session.currentSort);
    const nextQuestion = payload.questions[nextIndex];
    const savedAnswer = nextQuestion ? answers[nextQuestion.id] : undefined;

    setSession(payload.session);
    setQuestions(payload.questions);
    setCurrentIndex(nextIndex);
    setActiveSectionType(nextQuestion?.type || getFirstSectionType(payload.questions));
    setSelectedOptions(Array.isArray(savedAnswer) ? savedAnswer : []);
    setYesNoAnswer(typeof savedAnswer === 'boolean' ? savedAnswer : null);
    setLastResult(nextQuestion ? results[nextQuestion.id] ?? null : null);
    setAnswersByQuestion(answers);
    setResultsByQuestion(results);
    setReviewFlags(hydrateReviewFlagsFromQuestions(payload.questions));
    setSaveState('idle');
    setSubmitCheckOpen(false);
    setSessionResults(results);
    currentSessionIdRef.current = payload.session.id;
  }

  async function loadActiveSessions() {
    setActiveSessionsLoading(true);
    try {
      const result = await api(
        '/api/practice/sessions?status=active&limit=20&offset=0',
        {},
        (body) => PracticeSessionPageV1Schema.parse(body),
      );
      setActiveSessions(result.sessions);
    } catch (error) {
      setActiveSessions([]);
      setMessage(error instanceof Error ? error.message : '进行中练习加载失败');
    } finally {
      setActiveSessionsLoading(false);
    }
  }

  async function loadHistorySessions() {
    setHistoryLoading(true);
    try {
      const result = await api(
        '/api/practice/sessions?status=completed&limit=20&offset=0',
        {},
        (body) => PracticeSessionPageV1Schema.parse(body),
      );
      setHistorySessions(result.sessions);
    } catch (error) {
      setHistorySessions([]);
      setMessage(error instanceof Error ? error.message : '练习历史加载失败');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadPracticeSession(sessionId: string) {
    const requestId = ++practiceRequestRef.current;
    setPracticeLoading(true);
    setMessage('');
    setSession(null);
    setQuestions([]);
    currentSessionIdRef.current = '';
    try {
      const result = await api(
        `/api/practice/sessions/${sessionId}`,
        {},
        (body) => PracticePayloadV1Schema.parse(body),
      );
      if (requestId !== practiceRequestRef.current) return;
      applyPracticePayload(result);
    } catch (error) {
      if (requestId !== practiceRequestRef.current) return;
      setMessage(error instanceof Error ? error.message : '练习加载失败');
      navigateTo({ view: 'home' }, { replace: true, keepMessage: true });
    } finally {
      if (requestId === practiceRequestRef.current) {
        setPracticeLoading(false);
      }
    }
  }

  async function loadBanks() {
    setMessage('');
    try {
      const result = await api('/api/banks', {}, (body) => CatalogBankListResponseV1Schema.parse(body));
      setBanks(result.banks);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '题库加载失败');
    }
  }

  async function startPractice(bank: Bank) {
    if (!isCanonicalUuid(bank.bankId)) {
      setMessage('当前题库不是数据库题库 ID。请先用 USE_DATABASE=true 启动 API 并完成题库导入。');
      return;
    }

    setMessage('');
    setLoading(true);
    try {
      const result = await api(
        '/api/practice/sessions',
        {
          method: 'POST',
          body: JSON.stringify({ bankId: bank.bankId, mode, limit: 70, questionTypes: objectiveTypes }),
        },
        (body) => PracticePayloadV1Schema.parse(body),
      );
      applyPracticePayload(result);
      navigateTo({ view: 'practice', sessionId: result.session.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建练习失败');
    } finally {
      setLoading(false);
    }
  }

  function enqueueDraftSave(question: PracticeQuestion, answer: SavedAnswer | undefined) {
    if (!session || isCompleted) return;
    setSaveState('saving');
    const sessionId = session.id;
    draftSaveChainRef.current = draftSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          if (answer === undefined) {
            await api(`/api/practice/sessions/${sessionId}/drafts/${question.id}`, { method: 'DELETE' });
          } else {
            await api(
              `/api/practice/sessions/${sessionId}/drafts/${question.id}`,
              {
                method: 'PUT',
                body: JSON.stringify({ answer }),
              },
              (body) => PracticeQuestionV1Schema.parse(body),
            );
          }
          draftSaveFailedRef.current = false;
          setSaveState('saved');
        } catch (error) {
          draftSaveFailedRef.current = true;
          setSaveState('failed');
          throw error;
        }
      });
  }

  function setDraftAnswer(question: PracticeQuestion, answer: SavedAnswer | undefined) {
    if (isCompleted) return;
    setAnswersByQuestion((items) => {
      if (answer === undefined) {
        const nextItems = { ...items };
        delete nextItems[question.id];
        return nextItems;
      }
      return { ...items, [question.id]: answer };
    });
    enqueueDraftSave(question, answer);
  }

  async function submitSession(force = false) {
    if (!session || isCompleted) return;
    if (!force) {
      setSubmitCheckOpen(true);
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      await draftSaveChainRef.current.catch(() => undefined);
      if (draftSaveFailedRef.current) {
        setMessage('草稿保存失败，稍后会重试');
        setSubmitCheckOpen(false);
        return;
      }
      const result = await api(
        `/api/practice/sessions/${session.id}/submit`,
        {
          method: 'POST',
          body: '{}',
        },
        (body) => PracticeSubmitSessionResponseV1Schema.parse(body),
      );
      const nextResults = Object.fromEntries(result.results.map((item) => [item.questionId, item]));
      setSession(result.session);
      setResultsByQuestion(nextResults);
      setSessionResults(nextResults);
      setLastResult(currentQuestion ? nextResults[currentQuestion.id] ?? null : null);
      setQuestions((items) => items.map((item) => ({ ...item, answered: hasSubmittedAnswer(answersByQuestion[item.id]) })));
      setSubmitCheckOpen(false);
      await loadWrongQuestions({ includeMastered });
    } catch (error) {
      setSubmitCheckOpen(false);
      setMessage(error instanceof Error ? error.message : '交卷失败');
    } finally {
      setLoading(false);
    }
  }

  function nextQuestion() {
    goToQuestion(Math.min(currentIndex + 1, questions.length - 1));
  }

  function previousQuestion() {
    goToQuestion(Math.max(currentIndex - 1, 0));
  }

  function goToQuestion(index: number) {
    const nextQuestionItem = questions[index];
    if (!nextQuestionItem) return;
    const savedAnswer = answersByQuestion[nextQuestionItem.id];
    setCurrentIndex(index);
    setActiveSectionType(nextQuestionItem.type);
    setSelectedOptions(Array.isArray(savedAnswer) ? savedAnswer : []);
    setYesNoAnswer(typeof savedAnswer === 'boolean' ? savedAnswer : null);
    setLastResult(isCompleted ? resultsByQuestion[nextQuestionItem.id] ?? null : null);
    if (session && !isCompleted) {
      const sessionId = session.id;
      const currentSort = nextQuestionItem.sort;
      progressSaveChainRef.current = progressSaveChainRef.current
        .catch(() => undefined)
        .then(() => api(
          `/api/practice/sessions/${sessionId}/progress`,
          {
            method: 'PATCH',
            body: JSON.stringify({ currentSort }),
          },
          (body) => PracticeSessionV1Schema.parse(body),
        ).then(() => undefined, () => undefined));
    }
  }

  function toggleOption(optionId: string) {
    if (!currentQuestion || isCompleted) return;
    let nextAnswer: string[];
    if (currentQuestion.type === 'single_choice') {
      nextAnswer = [optionId];
      setSelectedOptions(nextAnswer);
      setDraftAnswer(currentQuestion, nextAnswer);
      return;
    }
    setSelectedOptions((values) => {
      nextAnswer = values.includes(optionId) ? values.filter((id) => id !== optionId) : [...values, optionId];
      setDraftAnswer(currentQuestion, nextAnswer.length > 0 ? nextAnswer : undefined);
      return nextAnswer;
    });
  }

  function chooseYesNo(answer: boolean) {
    if (!currentQuestion || isCompleted) return;
    setYesNoAnswer(answer);
    setDraftAnswer(currentQuestion, answer);
  }

  function toggleReviewFlag() {
    if (!session || !currentQuestion) return;
    const markedForReview = !reviewFlags[currentQuestion.id];
    setReviewFlags((items) => ({ ...items, [currentQuestion.id]: markedForReview }));
    void api(
      `/api/practice/sessions/${session.id}/review/${currentQuestion.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ markedForReview }),
      },
      (body) => PracticeQuestionV1Schema.parse(body),
    ).catch(() => setReviewFlags((items) => ({ ...items, [currentQuestion.id]: !markedForReview })));
  }

  function switchSection(type: string) {
    const index = questions.findIndex((question) => question.type === type);
    if (index >= 0) goToQuestion(index);
  }

  function reviewQuestion(questionId: string) {
    const index = questions.findIndex((question) => question.id === questionId);
    if (index < 0) return;
    setSubmitCheckOpen(false);
    goToQuestion(index);
  }

  async function loadWrongQuestions(filters: { bankId?: string; includeMastered?: boolean } = {}) {
    const params = new URLSearchParams();
    if (filters.bankId) params.set('bankId', filters.bankId);
    if (filters.includeMastered) params.set('includeMastered', 'true');
    try {
      const result = await api(
        `/api/wrong-questions${params.toString() ? `?${params}` : ''}`,
        {},
        (body) => WrongQuestionListResponseV1Schema.parse(body),
      );
      setWrongQuestions(result.wrongQuestions);
    } catch {
      setWrongQuestions([]);
    }
  }

  async function loadWrongQuestionDetail(id: string) {
    setSelectedWrongId(id);
    setWrongDetailLoading(true);
    setMessage('');
    try {
      const result = await api(
        `/api/wrong-questions/${id}`,
        {},
        (body) => WrongQuestionDetailResponseV1Schema.parse(body),
      );
      setWrongDetail(result.wrongQuestion);
    } catch (error) {
      setWrongDetail(null);
      setMessage(error instanceof Error ? error.message : '错题详情加载失败');
    } finally {
      setWrongDetailLoading(false);
    }
  }

  async function markMastered(id: string) {
    await api(
      `/api/wrong-questions/${id}/mastered`,
      { method: 'POST', body: '{}' },
      (body) => MarkWrongQuestionMasteredResponseV1Schema.parse(body),
    );
    setWrongDetail((detail) => (detail && detail.id === id ? { ...detail, mastered: true } : detail));
    await loadWrongQuestions({ bankId: wrongBankId, includeMastered });
  }

  async function createWrongReviewSession() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api(
        '/api/wrong-questions/review-sessions',
        {
          method: 'POST',
          body: JSON.stringify({ bankId: wrongBankId || undefined, includeMastered, limit: 20 }),
        },
        (body) => WrongQuestionReviewSessionResponseV1Schema.parse(body),
      );
      const payload = await api(
        `/api/practice/sessions/${result.session.id}`,
        {},
        (body) => PracticePayloadV1Schema.parse(body),
      );
      applyPracticePayload(payload);
      navigateTo({ view: 'practice', sessionId: payload.session.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '错题再练创建失败');
    } finally {
      setLoading(false);
    }
  }

  if (!student) {
    return (
      <main className="login-screen">
        <section className="login-card">
          <p className="eyebrow">BKYExam Practice</p>
          <h1>把题库变成每天可继续的练习。</h1>
          <p className="lede">登录后保留草稿、标记存疑题，完成整套练习后再统一查看结果和错题。</p>
          <form onSubmit={login} className="login-form">
            <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="例如：student01" autoFocus />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              type="password"
              autoComplete="current-password"
            />
            <button disabled={loading || !loginName.trim() || !password}>{loading ? '登录中...' : '进入题库'}</button>
          </form>
          {message && <p className="error-text">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">BKYExam</p>
          <h1>学生练习台</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => navigateTo({ view: 'home' })} disabled={passwordResetRequired}>首页</button>
          <button className="ghost" onClick={() => navigateTo({ view: 'banks' })} disabled={passwordResetRequired}>题库</button>
          <button className="ghost" onClick={() => navigateTo({ view: 'wrong' })} disabled={passwordResetRequired}>错题 {wrongQuestions.length}</button>
          <button className="ghost" onClick={() => navigateTo({ view: 'history' })} disabled={passwordResetRequired}>历史</button>
          <div className="user-menu">
            <button className="ghost" onClick={() => setUserMenuOpen((open) => !open)}>{student.displayName || student.loginName}</button>
            {userMenuOpen && (
              <div className="user-menu-panel">
                <div className="user-menu-meta">
                  {studentIdentityMeta.map((item) => <span key={item}>{item}</span>)}
                </div>
                <button className="ghost" onClick={() => navigateTo({ view: 'accountPassword' })}>
                  {passwordResetRequired ? '立即修改密码' : '修改密码'}
                </button>
                <button className="ghost" onClick={logout}>注销登录</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {message && <div className="notice">{message}</div>}

      {view === 'accountPassword' && (
        <section className="panel account-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Account activation</p>
              <h2>{passwordResetRequired ? '首次登录需要修改临时密码' : '修改登录密码'}</h2>
              <p className="lede">
                {passwordResetRequired
                  ? '这是管理员发放或重置后的临时密码状态。完成改密后才能继续进入题库、练习和错题本。'
                  : '建议定期更新密码。修改成功后当前登录会继续保持。'}
              </p>
            </div>
          </div>
          <div className="account-grid">
            <article className="account-card">
              <p className="eyebrow">Student identity</p>
              <h3>{student.displayName}</h3>
              <ul>
                {studentIdentityMeta.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <form className="password-form" onSubmit={changeStudentPassword}>
              <label>
                当前密码
                <input
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  autoComplete="current-password"
                />
              </label>
              <label>
                新密码
                <input
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                />
              </label>
              <label>
                再次输入新密码
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                />
              </label>
              <button disabled={loading}>
                {loading ? '正在更新...' : passwordResetRequired ? '完成首次改密' : '保存新密码'}
              </button>
              {!passwordResetRequired && (
                <button className="ghost" type="button" onClick={() => navigateTo({ view: 'home' })}>
                  返回首页
                </button>
              )}
            </form>
          </div>
        </section>
      )}

      {view === 'home' && (
        <StudentHome
          activeSessions={activeSessions}
          loading={activeSessionsLoading}
          wrongQuestionCount={wrongQuestions.length}
          onRefresh={() => void loadActiveSessions()}
          onOpenSession={(sessionId) => navigateTo({ view: 'practice', sessionId })}
          onOpenBanks={() => navigateTo({ view: 'banks' })}
          onOpenWrongbook={() => navigateTo({ view: 'wrong' })}
          onOpenHistory={() => navigateTo({ view: 'history' })}
        />
      )}

      {view === 'banks' && (
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Question banks</p>
              <h2>选择题库</h2>
              <p className="lede">筛选内容后创建一条新的练习会话；已有进行中练习不会被覆盖。</p>
            </div>
          </div>

          <div className="toolbar">
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">全部分类</option>
              {filterOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索题库、科目、关键词" />
            <select value={mode} onChange={(event) => setMode(event.target.value as 'random' | 'sequential')}>
              <option value="random">随机 70 题</option>
              <option value="sequential">顺序 70 题</option>
            </select>
            <button onClick={loadBanks}>刷新题库</button>
          </div>

          <div className="bank-grid">
            {filteredBanks.map((bank) => (
              <article className="bank-card" key={bank.bankId}>
                <div className="bank-meta">
                  <span>{bank.subjectCategory}</span>
                  <span>{bank.questionCount} 题</span>
                </div>
                <h2>{bank.bankName}</h2>
                <p>{bank.description || bank.subjectName}</p>
                <div className="chips">
                  {getVisibleChips(bank.subjectName, bank.keywords).map((item) => <span key={item}>{item}</span>)}
                </div>
                <button onClick={() => startPractice(bank)} disabled={loading}>开始练习</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === 'history' && (
        <PracticeHistory
          sessions={historySessions}
          loading={historyLoading}
          onRefresh={() => void loadHistorySessions()}
          onOpenSession={(sessionId) => navigateTo({ view: 'practice', sessionId })}
        />
      )}

      {view === 'practice' && (!session || !currentQuestion) && (
        <section className="panel route-loading">
          <p className="eyebrow">Practice session</p>
          <h2>{practiceLoading ? '正在恢复练习...' : '当前练习不可用'}</h2>
          <p className="lede">可以返回首页选择其他进行中的练习。</p>
          <button className="ghost" onClick={() => navigateTo({ view: 'home' })}>返回首页</button>
        </section>
      )}

      {view === 'practice' && session && currentQuestion && (
        <>
          <PracticeDesk
            session={session}
            questions={questions}
            currentQuestion={currentQuestion}
            currentIndex={currentIndex}
            activeSectionType={activeSectionType}
            sections={sections}
            sectionScores={sectionScores}
            selectedOptions={selectedOptions}
            yesNoAnswer={yesNoAnswer}
            answersByQuestion={answersByQuestion}
            reviewFlags={reviewFlags}
            lastResult={lastResult}
            resultCount={Object.keys(sessionResults).length}
            answeredCount={answeredCount}
            unansweredCount={unansweredCount}
            saveState={saveState}
            saveStatusText={saveStatusText}
            loading={loading}
            isCompleted={isCompleted}
            onGoToQuestion={goToQuestion}
            onSwitchSection={switchSection}
            onToggleOption={toggleOption}
            onChooseYesNo={chooseYesNo}
            onToggleReviewFlag={toggleReviewFlag}
            onPreviousQuestion={previousQuestion}
            onNextQuestion={nextQuestion}
            onOpenSubmitCheck={() => void submitSession()}
            onBackToBanks={() => navigateTo({ view: 'banks' })}
          />
          {submitCheckOpen && !isCompleted && (
            <SubmitCheckDialog
              questions={questions}
              answersByQuestion={answersByQuestion}
              reviewFlags={reviewFlags}
              loading={loading}
              onClose={() => setSubmitCheckOpen(false)}
              onReviewQuestion={reviewQuestion}
              onConfirm={() => void submitSession(true)}
            />
          )}
        </>
      )}

      {view === 'wrong' && (
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Wrong notebook</p>
              <h2>错题本</h2>
              <p className="lede">按题库筛选后直接订正，再把这一组错题拉回练习会话。</p>
            </div>
            <div className="topbar-actions">
              <button className="ghost" onClick={() => loadWrongQuestions({ bankId: wrongBankId, includeMastered })}>刷新</button>
              <button onClick={createWrongReviewSession} disabled={loading || filteredWrongQuestions.length === 0}>{loading ? '创建中...' : '再练本组'}</button>
            </div>
          </div>
          <div className="wrong-stats">
            <span><strong>{wrongStats.total}</strong> 当前错题</span>
            <span><strong>{wrongStats.active}</strong> 待巩固</span>
            <span><strong>{wrongStats.mastered}</strong> 已掌握</span>
          </div>
          <div className="toolbar wrong-toolbar">
            <select value={wrongBankId} onChange={(event) => setWrongBankId(event.target.value)}>
              <option value="">全部题库</option>
              {banks.map((bank) => <option key={bank.bankId} value={bank.bankId}>{bank.bankName}</option>)}
            </select>
            <label className="checkbox-row">
              <input type="checkbox" checked={includeMastered} onChange={(event) => setIncludeMastered(event.target.checked)} />
              显示已掌握
            </label>
          </div>
          <div className="wrongbook-layout">
            <div className="wrong-list">
              {filteredWrongQuestions.length === 0 && <p className="empty">当前筛选下没有错题。先去练一组题，或切换筛选条件。</p>}
              {filteredWrongQuestions.map((item) => (
                <article className={`wrong-row ${selectedWrongId === item.id ? 'selected' : ''}`} key={item.id}>
                  <button className="wrong-row-main" onClick={() => loadWrongQuestionDetail(item.id)}>
                    <span className="wrong-row-bank">{item.bankName}</span>
                    <strong>{item.contentPreview || item.questionId}</strong>
                    <span>错 {item.wrongCount} 次，最近答案：{formatStoredAnswer(item.lastAnswer)}</span>
                    <span className={item.mastered ? 'status mastered' : 'status'}>{item.mastered ? '已掌握' : '未掌握'}</span>
                  </button>
                  <button className="ghost" onClick={() => markMastered(item.id)} disabled={item.mastered}>{item.mastered ? '已掌握' : '标记掌握'}</button>
                </article>
              ))}
            </div>
            <aside className="wrong-detail">
              {wrongDetailLoading && <p className="empty">正在加载错题详情...</p>}
              {!wrongDetailLoading && !wrongDetail && <p className="empty">选择一道错题，查看题干、答案和解析。</p>}
              {!wrongDetailLoading && wrongDetail && (
                <div className="wrong-detail-card">
                  <div className="bank-meta">
                    <span>{wrongDetail.subjectCategory || wrongDetail.questionType}</span>
                    <span>{wrongDetail.bankName}</span>
                  </div>
                  <h2>{wrongDetail.content}</h2>
                  {wrongDetail.options.length > 0 && (
                    <div className="answer-grid">
                      {wrongDetail.options.map((option) => (
                        <div className="review-option" key={option.id}>
                          <span>{option.sort}</span>
                          <p>{option.content || option.id}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="review-columns">
                    <div>
                      <p className="eyebrow">Your answer</p>
                      <strong>{formatStoredAnswer(wrongDetail.lastAnswer, wrongDetail.options)}</strong>
                    </div>
                    <div>
                      <p className="eyebrow">Correct</p>
                      <strong>{formatCorrectAnswer(wrongDetail.correctAnswer, wrongDetail.options)}</strong>
                    </div>
                  </div>
                  <div className="analysis-box">
                    <p className="eyebrow">订正解析</p>
                    <p>{wrongDetail.analysis || '暂无解析。先对照参考答案复盘本题，再用“再练本组”巩固。'}</p>
                  </div>
                  <div className="question-actions">
                    <button className="ghost" onClick={() => markMastered(wrongDetail.id)} disabled={wrongDetail.mastered}>{wrongDetail.mastered ? '已掌握' : '标记掌握'}</button>
                    <button onClick={createWrongReviewSession} disabled={loading}>{loading ? '创建中...' : '再练本组'}</button>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </section>
      )}
    </main>
  );
}
