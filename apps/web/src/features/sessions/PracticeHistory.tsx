import type { PracticeSessionCardV1 } from '@bkyexam-practice/shared';
import { SessionCard } from './SessionCard';

interface PracticeHistoryProps {
  sessions: PracticeSessionCardV1[];
  loading: boolean;
  onRefresh: () => void;
  onOpenSession: (sessionId: string) => void;
}

export function PracticeHistory({
  sessions,
  loading,
  onRefresh,
  onOpenSession,
}: PracticeHistoryProps) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Practice history</p>
          <h2>练习历史</h2>
          <p className="lede">这里只展示已提交会话；结果详情与当次练习使用同一个只读地址。</p>
        </div>
        <button className="ghost" onClick={onRefresh} disabled={loading}>
          {loading ? '刷新中...' : '刷新历史'}
        </button>
      </div>
      {sessions.length === 0 && <p className="empty">暂无已完成练习。</p>}
      <div className="session-list history-list">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            actionLabel="查看结果"
            onOpen={onOpenSession}
          />
        ))}
      </div>
    </section>
  );
}
