import {
  buildQuestionStatus,
  buildQuestionTypeLabel,
  formatCorrectAnswer,
  hasSubmittedAnswer,
  type AnswerResult,
  type PracticeQuestion,
  type PracticeSession,
  type SavedAnswer,
  type SaveStatus,
} from './model';

type PracticeSection = {
  type: string;
  label: string;
  questions: PracticeQuestion[];
};

type SectionScore = {
  type: string;
  label: string;
  correctCount: number;
  totalCount: number;
};

type PracticeDeskProps = {
  session: PracticeSession;
  questions: PracticeQuestion[];
  currentQuestion: PracticeQuestion;
  currentIndex: number;
  activeSectionType: string;
  sections: PracticeSection[];
  sectionScores: SectionScore[];
  selectedOptions: string[];
  yesNoAnswer: boolean | null;
  answersByQuestion: Record<string, SavedAnswer>;
  reviewFlags: Record<string, boolean>;
  lastResult: AnswerResult | null;
  resultCount: number;
  answeredCount: number;
  unansweredCount: number;
  saveState: SaveStatus;
  saveStatusText: string;
  loading: boolean;
  isCompleted: boolean;
  onGoToQuestion: (index: number) => void;
  onSwitchSection: (type: string) => void;
  onToggleOption: (optionId: string) => void;
  onChooseYesNo: (answer: boolean) => void;
  onToggleReviewFlag: () => void;
  onPreviousQuestion: () => void;
  onNextQuestion: () => void;
  onOpenSubmitCheck: () => void;
  onBackToBanks: () => void;
};

export function PracticeDesk({
  session,
  questions,
  currentQuestion,
  currentIndex,
  activeSectionType,
  sections,
  sectionScores,
  selectedOptions,
  yesNoAnswer,
  answersByQuestion,
  reviewFlags,
  lastResult,
  resultCount,
  answeredCount,
  unansweredCount,
  saveState,
  saveStatusText,
  loading,
  isCompleted,
  onGoToQuestion,
  onSwitchSection,
  onToggleOption,
  onChooseYesNo,
  onToggleReviewFlag,
  onPreviousQuestion,
  onNextQuestion,
  onOpenSubmitCheck,
  onBackToBanks,
}: PracticeDeskProps) {
  const currentReviewFlag = reviewFlags[currentQuestion.id] === true;

  return (
    <section className="practice-layout practice-desk">
      <article className="question-card practice-question-card">
        <div className="question-head practice-question-head">
          <div className="question-number">
            <span className="q-kicker">Question</span>
            <strong className="q-index">{String(currentIndex + 1).padStart(2, '0')}</strong>
          </div>
          <div className="q-tags">
            <span className="badge type">{buildQuestionTypeLabel(currentQuestion.type).long}</span>
            <span className="badge chapter">题目序号 {currentQuestion.sort} / 共 {questions.length} 题</span>
            {currentReviewFlag && <span className="badge flag">已标存疑</span>}
          </div>
        </div>

        <div className="review practice-review">
          <button className={currentReviewFlag ? 'review-active' : 'ghost'} onClick={onToggleReviewFlag} disabled={isCompleted}>
            {currentReviewFlag ? '取消存疑' : '标记存疑'}
          </button>
          <span className={`save-status ${saveState}`}>{saveStatusText}</span>
        </div>

        <h2>{currentQuestion.content || '（题干为空）'}</h2>

        {currentQuestion.type === 'yes_no' ? (
          <div className="answer-grid two">
            <button className={yesNoAnswer === true ? 'selected' : ''} onClick={() => onChooseYesNo(true)} disabled={isCompleted}>正确 / 是</button>
            <button className={yesNoAnswer === false ? 'selected' : ''} onClick={() => onChooseYesNo(false)} disabled={isCompleted}>错误 / 否</button>
          </div>
        ) : (
          <div className="answer-grid">
            {currentQuestion.options.map((option) => (
              <button
                key={option.id}
                className={selectedOptions.includes(option.id) ? 'selected' : ''}
                onClick={() => onToggleOption(option.id)}
                disabled={isCompleted}
              >
                <span>{option.sort}</span>
                {option.content || option.id}
              </button>
            ))}
          </div>
        )}

        <div className="question-actions practice-actions">
          <button className="ghost" onClick={onPreviousQuestion} disabled={currentIndex <= 0}>上一题</button>
          <button onClick={onOpenSubmitCheck} disabled={loading || isCompleted}>
            {loading ? '交卷中...' : isCompleted ? '已交卷' : '提交前检查'}
          </button>
          <button className="ghost" onClick={onNextQuestion} disabled={currentIndex >= questions.length - 1}>下一题</button>
        </div>

        {isCompleted && resultCount > 0 && (
          <div className="score-summary">
            <strong>本次练习：{session.correctCount}/{questions.length}</strong>
            <span>已生成 {resultCount} 道题的判分结果，可通过右侧题号逐题回看。</span>
          </div>
        )}

        {isCompleted && lastResult && (
          <div className={lastResult.isCorrect ? 'result correct' : lastResult.isCorrect === false ? 'result wrong' : 'result'}>
            <strong>{lastResult.needsSelfReview ? '需要自评' : lastResult.isCorrect ? '答对了' : '答错了，已加入错题本'}</strong>
            <p>参考答案：{formatCorrectAnswer(lastResult.correctAnswer, currentQuestion.options)}</p>
          </div>
        )}
      </article>

      <aside className="progress-panel practice-status-panel" aria-label="右侧答题状态栏">
        <div className="side-head">
          <div>
            <p className="eyebrow">Practice session</p>
            <h2>答题状态</h2>
            <span>{isCompleted ? `正确 ${session.correctCount} 题` : `未答 ${unansweredCount} 题`}</span>
          </div>
          <strong>{answeredCount}/{questions.length}</strong>
        </div>

        <div className="progress-bar">
          <span style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
        </div>

        <div className="legend" aria-label="颜色图例">
          <span><i className="dot current" />当前题</span>
          <span><i className="dot answered" />已答</span>
          <span><i className="dot unanswered" />未答</span>
          <span><i className="dot flagged" />存疑</span>
          <span><i className="dot mixed" />已答存疑</span>
        </div>

        <div className="section-tabs" aria-label="题型分区">
          {sections.map((section) => (
            <button
              key={section.type}
              className={section.type === activeSectionType ? 'current' : ''}
              onClick={() => onSwitchSection(section.type)}
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

        <div className="question-map-scroll">
          {sections.map((section) => (
            <section className="question-map-section" key={section.type}>
              <div className="question-map-title">
                <span>{section.label}</span>
                <span>{section.questions.length} 题</span>
              </div>
              <div className="question-map" aria-label={`${section.label}题目导航`}>
                {section.questions.map((item) => {
                  const index = questions.findIndex((question) => question.id === item.id);
                  const answer = answersByQuestion[item.id];
                  const status = buildQuestionStatus({
                    current: index === currentIndex,
                    answered: hasSubmittedAnswer(answer),
                    flagged: reviewFlags[item.id] === true,
                  });
                  return (
                    <button
                      key={item.id}
                      className={status}
                      onClick={() => onGoToQuestion(index)}
                      aria-label={`第 ${index + 1} 题，${buildQuestionTypeLabel(item.type).short}，${hasSubmittedAnswer(answer) ? '已答' : '未答'}${reviewFlags[item.id] ? '，存疑' : ''}`}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <button className="side-submit" onClick={onOpenSubmitCheck} disabled={loading || isCompleted}>
          {isCompleted ? '本次练习已完成' : '提交前检查'}
        </button>
        <button className="ghost" onClick={onBackToBanks}>返回题库</button>
      </aside>
    </section>
  );
}
