import {
  AlarmClock,
  MailQuestion,
  Siren,
  TrendingUp,
  UserRoundPlus
} from "lucide-react";
import type { DashboardSnapshot } from "@/modules/reports/dashboard-query";
import { ChannelHealth } from "./channel-health";
import { MetricCard } from "./metric-card";
import { PriorityTaskTable } from "./priority-task-table";
import { SegmentDistribution } from "./segment-distribution";
import { TeamWorkload } from "./team-workload";
import styles from "./dashboard.module.css";

type DashboardOverviewProps = {
  isAdministrator: boolean;
  memberName: string;
  now: Date;
  snapshot: DashboardSnapshot;
};

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("zh-CN", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Shanghai"
    }).format(now)
  );
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function dateLabel(now: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "Asia/Shanghai"
  }).format(now);
}

export function DashboardOverview({
  isAdministrator,
  memberName,
  now,
  snapshot
}: DashboardOverviewProps): React.JSX.Element {
  const { metrics } = snapshot;
  return (
    <main className={styles.dashboard}>
      <header className={styles.pageHeading}>
        <div>
          <h1>用户运营概览</h1>
          <p>
            {greeting(now)}，{memberName}。今天需要重点关注的运营事项都在这里。
          </p>
        </div>
        <time dateTime={now.toISOString()}>{dateLabel(now)}</time>
      </header>

      <section className={styles.metrics} aria-label="今日运营指标">
        <MetricCard
          label="今日待处理"
          value={metrics.dueToday.toLocaleString("zh-CN")}
          note={
            metrics.overdue
              ? `其中 ${metrics.overdue} 项已逾期`
              : "当前没有逾期任务"
          }
          icon={AlarmClock}
          tone="neutral"
          href="/tasks?view=all&due=today"
        />
        <MetricCard
          label="紧急任务"
          value={metrics.urgent.toLocaleString("zh-CN")}
          note={metrics.urgent ? "需要立即介入" : "目前无需紧急介入"}
          icon={Siren}
          tone="danger"
          href="/tasks?view=all&priority=URGENT&scope=open"
        />
        <MetricCard
          label="用户待回复"
          value={metrics.awaitingReply.toLocaleString("zh-CN")}
          note="用户来信会自动生成跟进任务"
          icon={MailQuestion}
          tone="warning"
          href="/tasks?view=all&origin=EMAIL_REPLY&scope=open"
        />
        {isAdministrator ? (
          <MetricCard
            label="待分配用户"
            value={metrics.unassignedUsers.toLocaleString("zh-CN")}
            note={
              metrics.unassignedUsers
                ? "需要确认地区或指定运营"
                : "所有用户均已有负责人"
            }
            icon={UserRoundPlus}
            tone={metrics.unassignedUsers ? "warning" : "positive"}
            href="/users?ownerId=__UNASSIGNED__"
          />
        ) : null}
        <MetricCard
          label="7 日召回转化"
          value={
            metrics.sevenDayRecallRate === null
              ? "—"
              : `${metrics.sevenDayRecallRate}%`
          }
          note={
            metrics.sevenDayRecallRate === null
              ? "等待形成可计算样本"
              : "按已完成召回任务计算"
          }
          icon={TrendingUp}
          tone="positive"
        />
      </section>

      <div className={styles.primaryGrid}>
        <PriorityTaskTable tasks={snapshot.priorityTasks} now={now} />
        <SegmentDistribution rows={snapshot.segmentDistribution} />
      </div>

      <div className={styles.secondaryGrid}>
        <ChannelHealth rows={snapshot.channelHealth} />
        <TeamWorkload rows={snapshot.teamWorkload} />
      </div>
    </main>
  );
}
