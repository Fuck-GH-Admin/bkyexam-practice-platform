import { useEffect, useMemo, useState } from 'react';

import {
  buildPracticeCheckSummary,
  buildQuestionTypeLabel,
  formatSavedAnswer,
  hasSubmittedAnswer,
  type PracticeQuestion,
  type SavedAnswer,
} from './model';

type SubmitCheckFilter = 'all' | 'unanswered' | 'flagged';

type SubmitCheckDialogProps = {
  questions: PracticeQuestion[];
  answersByQuestion: Record<string, SavedAnswer>;
  reviewFlags: Record<string, boolean>;
  loading: boolean;
  onClose: () => void;
  onReviewQuestion: (questionId: string) => void;
  onConfirm: () => void;
};

export function SubmitCheckDialog({
  questions,
  answersByQuestion,
  reviewFlags,
  loading,
  onClose,
  onReviewQuestion,
  onConfirm,
}: SubmitCheckDialogProps) {
  const [filter, setFilter] = useState<SubmitCheckFilter>('all');
  const summary = useMemo(
    () => buildPracticeCheckSummary(questions, answersByQuestion, reviewFlags),
    [questions, answersByQuestion, reviewFlags],
  );
  const sections = [
    { key: 'unanswered' as const, title: '未答清单', items: summary.unanswered },
    { key: 'flagged' as const, title: '存疑清单', items: summary.flagged },
  ].filter((section) => filter === 'all' || filter === section.key);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onClose();
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [loading, onClose]);

  return (
    <section className="submit-overlay" role="dialog" aria-modal="true" aria-labelledby="submit-check-title">
      <div className="submit-panel">
        <header className="modal-head">
          <div>
            <p className="eyebrow">Submit inspector</p>
            <h2 id="submit-check-title">提交前检查</h2>
            <p>
              当前还有 <strong className="risk">{summary.unansweredCount} 道未答</strong>、
              <strong className="risk">{summary.flaggedCount} 道存疑</strong>。
              提交后本次练习将进入只读结果状态。
            </p>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="关闭提交前检查" disabled={loading}>×</button>
        </header>

        <div className="risk-stats" aria-label="提交检查统计">
          <span><strong>{summary.total}</strong>题目总数</span>
          <span><strong>{summary.answeredCount}</strong>已答</span>
          <span><strong>{summary.unansweredCount}</strong>未答</span>
          <span><strong>{summary.flaggedCount}</strong>存疑</span>
        </div>

        <div className="modal-body">
          <aside className="filter-card" aria-label="检查筛选">
            <h3>筛选范围</h3>
            <div className="filter-tabs">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                <span>全部风险项</span>
                <strong>{summary.unansweredCount + summary.flaggedCount}</strong>
              </button>
              <button className={filter === 'unanswered' ? 'active' : ''} onClick={() => setFilter('unanswered')}>
                <span>未答</span>
                <strong>{summary.unansweredCount}</strong>
              </button>
              <button className={filter === 'flagged' ? 'active' : ''} onClick={() => setFilter('flagged')}>
                <span>存疑</span>
                <strong>{summary.flaggedCount}</strong>
              </button>
            </div>
            <ol className="priority-list">
              <li>先补未答题，避免本次不产生作答记录。</li>
              <li>再检查存疑题，确认草稿答案是否准确。</li>
              <li>确认提交后将统一判分，并同步错题本。</li>
            </ol>
          </aside>

          <div className="check-list">
            {sections.map((section) => (
              <section className="check-section" key={section.key}>
                <div className="section-title">
                  <h3>{section.title}</h3>
                  <span>{section.items.length} 项</span>
                </div>
                {section.items.length === 0 && <p className="check-empty">这一组没有需要检查的题目。</p>}
                {section.items.map((item) => {
                  const index = questions.findIndex((question) => question.id === item.id);
                  const answer = answersByQuestion[item.id];
                  return (
                    <article className={`check-item ${section.key}`} key={`${section.key}-${item.id}`}>
                      <strong className="check-id">Q{String(index + 1).padStart(2, '0')}</strong>
                      <div className="check-main">
                        <h4>{item.content || item.id}</h4>
                        <div className="meta-line">
                          <span className="badge type">{buildQuestionTypeLabel(item.type).short}</span>
                          <span className="badge chapter">题目序号 {item.sort}</span>
                        </div>
                        <p className="answer-line">当前答案：{formatSavedAnswer(answer, item.options)}</p>
                        <p className="risk-line">
                          {hasSubmittedAnswer(answer)
                            ? '本题已有草稿，但仍标记为存疑。'
                            : '本题没有有效草稿，提交后不会产生作答记录。'}
                        </p>
                      </div>
                      <button className="review-btn" onClick={() => onReviewQuestion(item.id)}>回看</button>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>

          <aside className="confirm-card">
            <h3>{summary.unansweredCount + summary.flaggedCount === 0 ? '这份练习可以提交' : '仍要提交这份练习吗？'}</h3>
            <p>
              {summary.unansweredCount
                ? `仍有 ${summary.unansweredCount} 道未答题；这些题目不会产生作答记录，但本次练习仍会结束。`
                : '所有题目都已有草稿答案。'}
            </p>
            <ul>
              <li>{summary.unansweredCount ? `未答题号：${formatQuestionNumbers(summary.unanswered, questions)}` : '没有未答题。'}</li>
              <li>{summary.flaggedCount ? `存疑题号：${formatQuestionNumbers(summary.flagged, questions)}` : '没有存疑题。'}</li>
              <li>确认后统一判分、生成结果并更新错题本。</li>
            </ul>
          </aside>
        </div>

        <footer className="modal-foot">
          <p>点击“回看”会关闭检查面板并定位到对应题目。</p>
          <div className="modal-actions">
            <button className="ghost" onClick={onClose} disabled={loading}>返回继续作答</button>
            <button className="danger" onClick={onConfirm} disabled={loading}>
              {loading ? '正在提交...' : '确认提交'}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}

function formatQuestionNumbers(items: PracticeQuestion[], questions: PracticeQuestion[]) {
  return items
    .map((item) => `Q${String(questions.findIndex((question) => question.id === item.id) + 1).padStart(2, '0')}`)
    .join('、');
}
