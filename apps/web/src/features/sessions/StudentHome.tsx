import type { PracticeSessionCardV1 } from '@bkyexam-practice/shared';
import { SessionCard } from './SessionCard';

interface StudentHomeProps {
  activeSessions: PracticeSessionCardV1[];
  loading: boolean;
  wrongQuestionCount: number;
  onRefresh: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenBanks: () => void;
  onOpenWrongbook: () => void;
  onOpenHistory: () => void;
}

export function StudentHome({
  activeSessions,
  loading,
  wrongQuestionCount,
  onRefresh,
  onOpenSession,
  onOpenBanks,
  onOpenWrongbook,
  onOpenHistory,
}: StudentHomeProps) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Student home</p>
          <h2>学生首页</h2>
          <p className="lede">先处理正在进行的练习，再选择新的学习任务。</p>
        </div>
        <button className="ghost" onClick={onRefresh} disabled={loading}>
          {loading ? '刷新中...' : '刷新进度'}
        </button>
      </div>

      <section className="student-section" aria-labelledby="active-session-heading">
        <div className="section-title-row">
          <h3 id="active-session-heading">继续练习</h3>
          <span>{activeSessions.length} 个进行中</span>
        </div>
        {activeSessions.length === 0 && (
          <p className="empty">暂无进行中的练习。去题库创建一组，或从错题本开始再练。</p>
        )}
        <div className="session-list">
          {activeSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              actionLabel="继续练习"
              onOpen={onOpenSession}
            />
          ))}
        </div>
      </section>

      <div className="home-grid">
        <article>
          <p className="eyebrow">Banks</p>
          <h2>选择题库</h2>
          <p>按科目、分类和关键词筛选，创建新的随机或顺序练习。</p>
          <button className="ghost" onClick={onOpenBanks}>选择题库</button>
        </article>
        <article>
          <p className="eyebrow">Wrongbook</p>
          <h2>错题本</h2>
          <p>当前收录 {wrongQuestionCount} 道错题，可订正、标记掌握或再练。</p>
          <button className="ghost" onClick={onOpenWrongbook}>打开错题本</button>
        </article>
        <article>
          <p className="eyebrow">History</p>
          <h2>练习历史</h2>
          <p>查看已经提交的练习，并回到逐题结果详情。</p>
          <button className="ghost" onClick={onOpenHistory}>查看练习历史</button>
        </article>
      </div>
    </section>
  );
}
