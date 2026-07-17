import type { PracticeSessionCardV1 } from '@bkyexam-practice/shared';

interface SessionCardProps {
  session: PracticeSessionCardV1;
  actionLabel: string;
  onOpen: (sessionId: string) => void;
}

export function SessionCard({ session, actionLabel, onOpen }: SessionCardProps) {
  const isCompleted = session.status === 'completed';

  return (
    <article className="session-card" data-session-id={session.id}>
      <div className="session-card-head">
        <div>
          <p className="eyebrow">{session.origin === 'wrongbook' ? 'Wrongbook review' : 'Bank practice'}</p>
          <h3>{session.bankName}</h3>
        </div>
        <span className={`status ${isCompleted ? 'mastered' : ''}`}>
          {isCompleted ? '已完成' : '进行中'}
        </span>
      </div>
      <div className="session-card-meta">
        <span>{session.mode === 'random' ? '随机练习' : '顺序练习'}</span>
        <span>{session.questionCount} 题</span>
        {isCompleted
          ? <span>正确 {session.correctCount}/{session.answeredCount}</span>
          : <span>已答 {session.answeredCount}/{session.questionCount}</span>}
        <span>存疑 {session.reviewCount}</span>
      </div>
      <p className="session-time">
        {isCompleted ? '完成于' : '最近活动'} {formatSessionTime(isCompleted ? session.completedAt : session.updatedAt)}
      </p>
      <button
        onClick={() => onOpen(session.id)}
        aria-label={`${actionLabel}：${session.bankName}`}
      >
        {actionLabel}
      </button>
    </article>
  );
}

function formatSessionTime(value: string | null) {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
