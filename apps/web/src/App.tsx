import { FormEvent, useEffect, useMemo, useState } from 'react';

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
};

type PracticeSession = {
  id: string;
  bankId: string;
  mode: 'random' | 'sequential';
  questionCount: number;
  completedCount: number;
  correctCount: number;
  status: 'active' | 'completed';
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

export function hasSubmittedAnswer(answer: SavedAnswer | undefined) {
  return answer !== undefined;
}

export function getVisibleChips(subjectName: string, keywords: string[]) {
  return Array.from(new Set([subjectName, ...keywords].filter(Boolean))).slice(0, 4);
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
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [yesNoAnswer, setYesNoAnswer] = useState<boolean | null>(null);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [answersByQuestion, setAnswersByQuestion] = useState<Record<string, SavedAnswer>>({});
  const [resultsByQuestion, setResultsByQuestion] = useState<Record<string, AnswerResult>>({});
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [wrongBankId, setWrongBankId] = useState('');
  const [includeMastered, setIncludeMastered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<'banks' | 'practice' | 'wrong'>('banks');

  const categories = useMemo(
    () => Array.from(new Set(banks.map((bank) => bank.subjectCategory))).filter(Boolean),
    [banks],
  );
  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion ? answersByQuestion[currentQuestion.id] : undefined;
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
    setView('banks');
  }

  async function loadBanks() {
    setMessage('');
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (keyword.trim()) params.set('keyword', keyword.trim());
    try {
      const result = await api<{ banks: Bank[] }>(`/api/banks${params.toString() ? `?${params}` : ''}`);
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
      setSession(result.session);
      setQuestions(result.questions);
      setCurrentIndex(0);
      setSelectedOptions([]);
      setYesNoAnswer(null);
      setLastResult(null);
      setAnswersByQuestion({});
      setResultsByQuestion({});
      setView('practice');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建练习失败');
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    if (!session || !currentQuestion) return;
    const answer = currentQuestion.type === 'yes_no' ? yesNoAnswer : selectedOptions;
    if (answer === null || (Array.isArray(answer) && answer.length === 0)) {
      setMessage('请先选择答案。');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const result = await api<{ result: AnswerResult; session: Pick<PracticeSession, 'completedCount' | 'correctCount' | 'status'> }>(
        `/api/practice/sessions/${session.id}/answers`,
        {
          method: 'POST',
          body: JSON.stringify({ questionId: currentQuestion.id, answer }),
        },
      );
      setLastResult(result.result);
      setAnswersByQuestion((items) => ({ ...items, [currentQuestion.id]: answer }));
      setResultsByQuestion((items) => ({ ...items, [currentQuestion.id]: result.result }));
      setSession({ ...session, ...result.session });
      setQuestions((items) => items.map((item) => (item.id === currentQuestion.id ? { ...item, answered: true } : item)));
      if (result.result.isCorrect === false) void loadWrongQuestions({ includeMastered });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败');
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
    setSelectedOptions(Array.isArray(savedAnswer) ? savedAnswer : []);
    setYesNoAnswer(typeof savedAnswer === 'boolean' ? savedAnswer : null);
    setLastResult(resultsByQuestion[nextQuestionItem.id] ?? null);
  }

  function toggleOption(optionId: string) {
    if (!currentQuestion) return;
    if (currentQuestion.type === 'single_choice') {
      setSelectedOptions([optionId]);
      return;
    }
    setSelectedOptions((values) => (values.includes(optionId) ? values.filter((id) => id !== optionId) : [...values, optionId]));
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
          <h1>先登录，马上练题。</h1>
          <p className="lede">输入一个名字即可进入练习。目标很简单：现在开始刷题，不再等系统“更完美”。</p>
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
          <span>{student.displayName || student.loginName}</span>
          <button className="ghost" onClick={() => setView('banks')}>题库</button>
          <button className="ghost" onClick={() => setView('wrong')}>错题 {wrongQuestions.length}</button>
          <button className="ghost" onClick={logout}>退出</button>
        </div>
      </header>

      {message && <div className="notice">{message}</div>}

      {view === 'banks' && (
        <section className="panel">
          <div className="toolbar">
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">全部分类</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索题库、科目、关键词" />
            <select value={mode} onChange={(event) => setMode(event.target.value as 'random' | 'sequential')}>
              <option value="random">随机 70 题</option>
              <option value="sequential">顺序 70 题</option>
            </select>
            <button onClick={loadBanks}>搜索</button>
          </div>

          <div className="bank-grid">
            {banks.map((bank) => (
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
            <strong>{session.completedCount}/{session.questionCount}</strong>
            <span>正确 {session.correctCount}</span>
            <div className="progress-bar"><span style={{ width: `${session.questionCount ? (session.completedCount / session.questionCount) * 100 : 0}%` }} /></div>
            <div className="question-map" aria-label="题目导航">
              {questions.map((item, index) => (
                <button
                  key={item.id}
                  className={`${index === currentIndex ? 'current' : ''} ${item.answered ? 'answered' : ''}`}
                  onClick={() => goToQuestion(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <button className="ghost" onClick={() => setView('banks')}>返回题库</button>
          </aside>

          <article className="question-card">
            <div className="question-head">
              <span>第 {currentQuestion.sort} 题 / {questions.length}</span>
              <span>{typeLabel(currentQuestion.type)}</span>
            </div>
            <h2>{currentQuestion.content || '（题干为空）'}</h2>

            {currentQuestion.type === 'yes_no' ? (
              <div className="answer-grid two">
                <button className={yesNoAnswer === true ? 'selected' : ''} onClick={() => setYesNoAnswer(true)}>正确 / 是</button>
                <button className={yesNoAnswer === false ? 'selected' : ''} onClick={() => setYesNoAnswer(false)}>错误 / 否</button>
              </div>
            ) : (
              <div className="answer-grid">
                {currentQuestion.options.map((option) => (
                  <button key={option.id} className={selectedOptions.includes(option.id) ? 'selected' : ''} onClick={() => toggleOption(option.id)}>
                    <span>{option.sort}</span>
                    {option.content || option.id}
                  </button>
                ))}
              </div>
            )}

            <div className="question-actions">
              <button className="ghost" onClick={previousQuestion} disabled={currentIndex <= 0}>上一题</button>
              <button onClick={submitAnswer} disabled={loading || hasSubmittedAnswer(currentAnswer)}>{loading ? '提交中...' : hasSubmittedAnswer(currentAnswer) ? '已提交' : '提交答案'}</button>
              <button className="ghost" onClick={nextQuestion} disabled={currentIndex >= questions.length - 1}>下一题</button>
            </div>

            {lastResult && (
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
