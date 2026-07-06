import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Student = {
  id?: string;
  loginName: string;
  displayName: string;
};

type Bank = {
  bankId: string;
  bankName: string;
  subjectCategory: string;
  subjectName: string;
  keywords: string[];
  questionCount: number;
  description: string;
};

type PracticeOption = {
  id: string;
  sort: number;
  content: string;
};

type PracticeQuestion = {
  id: string;
  sort: number;
  type: string;
  content: string;
  options: PracticeOption[];
  answered: boolean;
  draftAnswer?: SavedAnswer;
  markedForReview?: boolean;
  isCorrect?: boolean | null;
};

type PracticeSession = {
  id: string;
  bankId: string;
  mode: 'random' | 'sequential';
  questionCount: number;
  completedCount: number;
  correctCount: number;
  status: 'active' | 'completed';
  currentSort?: number;
};

type PracticePayload = {
  session: PracticeSession;
  questions: PracticeQuestion[];
};

type AnswerResult = {
  questionId: string;
  isCorrect: boolean | null;
  correctAnswer: string[] | boolean | string;
  needsSelfReview: boolean;
};

type SavedAnswer = string[] | boolean;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

type WrongQuestion = {
  id: string;
  questionId: string;
  bankId: string;
  wrongCount: number;
  lastAnswer: string;
  mastered: boolean;
  lastWrongAt: string;
};

const objectiveTypes = ['single_choice', 'multiple_choice', 'yes_no'];

const practiceSections = [
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

export function getFirstSectionType(questions: PracticeQuestion[]) {
  return groupQuestionsByType(questions)[0]?.type ?? '';
}

export function getInitialQuestionIndex(questions: PracticeQuestion[], currentSort?: number) {
  if (currentSort === undefined) return 0;
  const index = questions.findIndex((question) => question.sort === currentSort);
  return index >= 0 ? index : 0;
}

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

export function formatCorrectAnswer(answer: AnswerResult['correctAnswer'], options: PracticeOption[] = []) {
  if (Array.isArray(answer)) {
    const optionsById = new Map(options.map((option) => [option.id, option.content || option.id]));
    return answer.map((item) => optionsById.get(item) ?? item).join('、');
  }

  return String(answer);
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    throw new Error(body?.error ?? `请求失败：${response.status}`);
  }

  return body as T;
}

function typeLabel(type: string) {
  if (type === 'single_choice') return '单选';
  if (type === 'multiple_choice') return '多选';
  if (type === 'yes_no') return '判断';
  if (type === 'fill_blank') return '填空';
  return type;
}

function isCanonicalUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function App() {
  const [student, setStudent] = useState<Student | null>(null);
  const [loginName, setLoginName] = useState('');
  const [banks, setBanks] = useState<Bank[]>([]);
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
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [sessionResults, setSessionResults] = useState<Record<string, AnswerResult>>({});
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [wrongBankId, setWrongBankId] = useState('');
  const [includeMastered, setIncludeMastered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<'banks' | 'practice' | 'wrong'>('banks');
  const draftSaveChainRef = useRef(Promise.resolve());
  const progressSaveChainRef = useRef(Promise.resolve());
  const draftSaveFailedRef = useRef(false);

  const filterOptions = useMemo(
    () => getFilterOptions(banks),
    [banks],
  );
  const filteredBanks = useMemo(() => filterBanks(banks, { category, keyword }), [banks, category, keyword]);
  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion ? answersByQuestion[currentQuestion.id] : undefined;
  const sections = useMemo(() => groupQuestionsByType(questions), [questions]);
  const activeSection = sections.find((section) => section.type === activeSectionType) ?? sections[0];
  const activeSectionQuestions = activeSection?.questions ?? [];
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

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (student) {
      void loadBanks();
      void loadWrongQuestions({ includeMastered });
    }
  }, [student, includeMastered]);

  useEffect(() => {
    if (student) void loadActiveSession();
  }, [student]);

  useEffect(() => {
    if (view === 'wrong') void loadWrongQuestions({ includeMastered, bankId: wrongBankId });
  }, [view, includeMastered, wrongBankId]);

  async function restoreSession() {
    try {
      const result = await api<{ student: Student }>('/api/auth/me');
      setStudent(result.student);
    } catch {
      setStudent(null);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      const result = await api<{ student: Student }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ loginName }),
      });
      setStudent(result.student);
      setLoginName('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    setStudent(null);
    setSession(null);
    setQuestions([]);
    setAnswersByQuestion({});
    setReviewFlags({});
    setSessionResults({});
    setUserMenuOpen(false);
    setView('banks');
  }

  function applyPracticePayload(payload: PracticePayload) {
    const answers = hydrateAnswersFromQuestions(payload.questions);
    const results = payload.questions.reduce<Record<string, AnswerResult>>((items, question) => {
      if (question.isCorrect !== undefined && question.isCorrect !== null) {
        items[question.id] = {
          questionId: question.id,
          isCorrect: question.isCorrect,
          correctAnswer: [],
          needsSelfReview: false,
        };
      }
      return items;
    }, {});
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
    setShowSubmitConfirm(false);
    setSessionResults(results);
  }

  async function loadActiveSession() {
    try {
      const activeSessions = await api<PracticeSession[]>('/api/practice/sessions/active');
      const activeSession = activeSessions[0];
      if (!activeSession) return;

      const result = await api<PracticePayload>(`/api/practice/sessions/${activeSession.id}`);
      applyPracticePayload(result);
    } catch {
      // Active practice is optional on the home screen.
    }
  }

  async function loadBanks() {
    setMessage('');
    try {
      const result = await api<{ banks: Bank[] }>('/api/banks');
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
      const result = await api<PracticePayload>('/api/practice/sessions', {
        method: 'POST',
        body: JSON.stringify({ bankId: bank.bankId, mode, limit: 70, questionTypes: objectiveTypes }),
      });
      applyPracticePayload(result);
      setView('practice');
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
            await api(`/api/practice/sessions/${sessionId}/drafts/${question.id}`, {
              method: 'PUT',
              body: JSON.stringify({ answer }),
            });
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
    if (!session) return;
    if (!force && unansweredCount > 0) {
      setShowSubmitConfirm(true);
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      await draftSaveChainRef.current.catch(() => undefined);
      if (draftSaveFailedRef.current) {
        setMessage('草稿保存失败，稍后会重试');
        return;
      }
      const result = await api<{ session: PracticeSession; results: AnswerResult[] }>(`/api/practice/sessions/${session.id}/submit`, {
        method: 'POST',
        body: '{}',
      });
      const nextResults = Object.fromEntries(result.results.map((item) => [item.questionId, item]));
      setSession(result.session);
      setResultsByQuestion(nextResults);
      setSessionResults(nextResults);
      setLastResult(currentQuestion ? nextResults[currentQuestion.id] ?? null : null);
      setQuestions((items) => items.map((item) => ({ ...item, answered: hasSubmittedAnswer(answersByQuestion[item.id]) })));
      setShowSubmitConfirm(false);
      await loadWrongQuestions({ includeMastered });
    } catch (error) {
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
        .then(() => api(`/api/practice/sessions/${sessionId}/progress`, {
          method: 'PATCH',
          body: JSON.stringify({ currentSort }),
        }).then(() => undefined, () => undefined));
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
    void api(`/api/practice/sessions/${session.id}/review/${currentQuestion.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ markedForReview }),
    }).catch(() => setReviewFlags((items) => ({ ...items, [currentQuestion.id]: !markedForReview })));
  }

  function switchSection(type: string) {
    const index = questions.findIndex((question) => question.type === type);
    if (index >= 0) goToQuestion(index);
  }

  async function loadWrongQuestions(filters: { bankId?: string; includeMastered?: boolean } = {}) {
    const params = new URLSearchParams();
    if (filters.bankId) params.set('bankId', filters.bankId);
    if (filters.includeMastered) params.set('includeMastered', 'true');
    try {
      const result = await api<{ wrongQuestions: WrongQuestion[] }>(`/api/wrong-questions${params.toString() ? `?${params}` : ''}`);
      setWrongQuestions(result.wrongQuestions);
    } catch {
      setWrongQuestions([]);
    }
  }

  async function markMastered(id: string) {
    await api(`/api/wrong-questions/${id}/mastered`, { method: 'POST', body: '{}' });
    await loadWrongQuestions({ bankId: wrongBankId, includeMastered });
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
            <button disabled={loading || !loginName.trim()}>{loading ? '登录中...' : '进入题库'}</button>
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
          <h1>全题库练习台</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={() => setView('banks')}>题库</button>
          <button className="ghost" onClick={() => setView('wrong')}>错题 {wrongQuestions.length}</button>
          <div className="user-menu">
            <button className="ghost" onClick={() => setUserMenuOpen((open) => !open)}>{student.displayName || student.loginName}</button>
            {userMenuOpen && (
              <div className="user-menu-panel">
                <button className="ghost" onClick={logout}>注销登录</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {message && <div className="notice">{message}</div>}

      {view === 'banks' && (
        <section className="panel">
          <div className="home-grid">
            <article>
              <p className="eyebrow">Continue</p>
              <h2>继续练习</h2>
              <p>{session?.status === 'active' ? `已完成草稿 ${answeredCount}/${questions.length}` : '暂无进行中的练习'}</p>
              <button onClick={() => session && setView('practice')} disabled={!session}>继续练习</button>
            </article>
            <article>
              <p className="eyebrow">Banks</p>
              <h2>选择题库</h2>
              <p>按科目、分类和关键词筛选，创建随机或顺序练习。</p>
              <button className="ghost" onClick={() => setView('banks')}>选择题库</button>
            </article>
            <article>
              <p className="eyebrow">Review</p>
              <h2>错题本</h2>
              <p>当前收录 {wrongQuestions.length} 道错题，可筛选题库或标记掌握。</p>
              <button className="ghost" onClick={() => setView('wrong')}>打开错题本</button>
            </article>
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

      {view === 'practice' && session && currentQuestion && (
        <section className="practice-layout">
          <aside className="progress-panel">
            <p className="eyebrow">Practice session</p>
            <strong>{answeredCount}/{questions.length}</strong>
            <span>{isCompleted ? `正确 ${session.correctCount}` : `未答 ${unansweredCount}`}</span>
            <div className="progress-bar"><span style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} /></div>
            <div className="section-tabs" aria-label="题型分区">
              {sections.map((section) => (
                <button
                  key={section.type}
                  className={section.type === activeSection?.type ? 'current' : ''}
                  onClick={() => switchSection(section.type)}
                >
                  {section.label} <span>{section.questions.length}</span>
                </button>
              ))}
            </div>
            {isCompleted && (
              <div className="section-summary">
                {sectionScores.map((section) => (
                  <span key={section.type}>{section.label} {section.correctCount}/{section.totalCount}</span>
                ))}
              </div>
            )}
            <div className="question-map" aria-label="题目导航">
              {activeSectionQuestions.map((item) => {
                const index = questions.findIndex((question) => question.id === item.id);
                return (
                  <button
                    key={item.id}
                    className={`${index === currentIndex ? 'current' : ''} ${getQuestionState(item, answersByQuestion, reviewFlags)}`}
                    onClick={() => goToQuestion(index)}
                  >
                    {item.sort}
                  </button>
                );
              })}
            </div>
            <button className="ghost" onClick={() => setView('banks')}>返回题库</button>
          </aside>

          <article className="question-card">
            <div className="question-head">
              <span>第 {currentQuestion.sort} 题 / {questions.length}</span>
              <span>{typeLabel(currentQuestion.type)}</span>
            </div>
            <div className="review">
              <button className={reviewFlags[currentQuestion.id] ? '' : 'ghost'} onClick={toggleReviewFlag} disabled={isCompleted}>
                标记存疑
              </button>
              <span className={`save-status ${saveState}`}>{saveStatusText}</span>
            </div>
            <h2>{currentQuestion.content || '（题干为空）'}</h2>

            {currentQuestion.type === 'yes_no' ? (
              <div className="answer-grid two">
                <button className={yesNoAnswer === true ? 'selected' : ''} onClick={() => chooseYesNo(true)} disabled={isCompleted}>正确 / 是</button>
                <button className={yesNoAnswer === false ? 'selected' : ''} onClick={() => chooseYesNo(false)} disabled={isCompleted}>错误 / 否</button>
              </div>
            ) : (
              <div className="answer-grid">
                {currentQuestion.options.map((option) => (
                  <button key={option.id} className={selectedOptions.includes(option.id) ? 'selected' : ''} onClick={() => toggleOption(option.id)} disabled={isCompleted}>
                    <span>{option.sort}</span>
                    {option.content || option.id}
                  </button>
                ))}
              </div>
            )}

            <div className="question-actions">
              <button className="ghost" onClick={previousQuestion} disabled={currentIndex <= 0}>上一题</button>
              <button onClick={() => submitSession()} disabled={loading || isCompleted}>{loading ? '交卷中...' : isCompleted ? '已交卷' : '交卷并查看结果'}</button>
              <button className="ghost" onClick={nextQuestion} disabled={currentIndex >= questions.length - 1}>下一题</button>
            </div>

            {showSubmitConfirm && (
              <div className="submit-confirm">
                <strong>还有 {unansweredCount} 题未作答，确定交卷吗？</strong>
                <div>
                  <button className="ghost" onClick={() => setShowSubmitConfirm(false)}>继续作答</button>
                  <button onClick={() => submitSession(true)} disabled={loading}>仍然交卷</button>
                </div>
              </div>
            )}

            {isCompleted && Object.keys(sessionResults).length > 0 && (
              <div className="score-summary">
                <strong>本次练习：{session.correctCount}/{questions.length}</strong>
                <span>已生成 {Object.keys(sessionResults).length} 道题的结果</span>
              </div>
            )}

            {isCompleted && lastResult && (
              <div className={lastResult.isCorrect ? 'result correct' : lastResult.isCorrect === false ? 'result wrong' : 'result'}>
                <strong>{lastResult.needsSelfReview ? '需要自评' : lastResult.isCorrect ? '答对了' : '答错了，已加入错题本'}</strong>
                <p>参考答案：{formatCorrectAnswer(lastResult.correctAnswer, currentQuestion.options)}</p>
              </div>
            )}
          </article>
        </section>
      )}

      {view === 'wrong' && (
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Wrong notebook</p>
              <h2>错题本</h2>
            </div>
            <button onClick={() => loadWrongQuestions({ bankId: wrongBankId, includeMastered })}>刷新</button>
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
          <div className="wrong-list">
            {filteredWrongQuestions.length === 0 && <p className="empty">当前筛选下没有错题。先去练一组题，或切换筛选条件。</p>}
            {filteredWrongQuestions.map((item) => (
              <article className="wrong-row" key={item.id}>
                <div>
                  <strong>{item.questionId}</strong>
                  <p>错 {item.wrongCount} 次，最近答案：{item.lastAnswer}</p>
                  <span className={item.mastered ? 'status mastered' : 'status'}>{item.mastered ? '已掌握' : '未掌握'}</span>
                </div>
                <button onClick={() => markMastered(item.id)} disabled={item.mastered}>{item.mastered ? '已掌握' : '标记掌握'}</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
