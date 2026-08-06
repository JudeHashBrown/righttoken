import {
  MailQuestion,
  Siren,
  TrendingUp,
  UserRoundPlus,
  UserRoundX
} from "lucide-react";
import type { DashboardSnapshot } from "@/modules/reports/dashboard-query";
import { ChannelHealth } from "./channel-health";
import { DashboardFocusList } from "./dashboard-focus-list";
import { MetricCard } from "./metric-card";
import { SegmentDistribution } from "./segment-distribution";
import { TeamWorkload } from "./team-workload";
import styles from "./dashboard.module.css";

type DashboardOverviewProps = {
  isAdministrator: boolean;
  snapshot: DashboardSnapshot;
};

export function DashboardOverview({
  isAdministrator,
  snapshot
}: DashboardOverviewProps): React.JSX.Element {
  const { metrics } = snapshot;
  return (
    <main className={styles.dashboard}>
      <h1 className={styles.srOnly}>运营仪表盘</h1>
      <section className={styles.metrics} aria-label="运营指标">
        <MetricCard
          label="近72小时注册未支付"
          value={metrics.recentUnpaid.toLocaleString("zh-CN")}
          note={metrics.recentUnpaid ? "点击查看用户列表" : "暂无符合条件用户"}
          icon={UserRoundX}
          tone="neutral"
          href="/dashboard?focus=recent-unpaid#focus-list"
        />
        <MetricCard
          label="近72小时服务异常"
          value={metrics.recentAnomalies.toLocaleString("zh-CN")}
          note={metrics.recentAnomalies ? "点击查看用户列表" : "暂无符合条件用户"}
          icon={Siren}
          tone="danger"
          href="/dashboard?focus=recent-anomaly#focus-list"
        />
        <MetricCard
          label="用户待回复"
          value={metrics.awaitingReply.toLocaleString("zh-CN")}
          note="用户来信会自动生成跟进任务"
          icon={MailQuestion}
          tone="warning"
          href="/mail?view=pending"
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
        <DashboardFocusList
          focus={snapshot.focus}
          total={
            snapshot.focus === "recent-unpaid"
              ? metrics.recentUnpaid
              : metrics.recentAnomalies
          }
          users={snapshot.focusUsers}
        />
        <SegmentDistribution rows={snapshot.segmentDistribution} />
      </div>

      <div className={styles.secondaryGrid}>
        <ChannelHealth rows={snapshot.channelHealth} />
        <TeamWorkload rows={snapshot.teamWorkload} />
      </div>
    </main>
  );
}
