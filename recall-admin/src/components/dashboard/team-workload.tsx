import { UsersRound } from "lucide-react";
import type { DashboardSnapshot } from "@/modules/reports/dashboard-query";
import styles from "./dashboard.module.css";

type TeamWorkloadProps = {
  rows: DashboardSnapshot["teamWorkload"];
};

export function TeamWorkload({
  rows
}: TeamWorkloadProps): React.JSX.Element {
  return (
    <section className={styles.panel} aria-labelledby="workload-heading">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="workload-heading">团队任务负载</h2>
          <p>未完成任务的当前分配</p>
        </div>
        <UsersRound aria-hidden="true" size={18} />
      </header>
      {rows.length === 0 ? (
        <p className={styles.compactEmpty}>暂无未完成任务</p>
      ) : (
        <div className={styles.workloadList}>
          {rows.map((row) => (
            <div
              className={styles.workloadRow}
              key={row.memberId ?? "public"}
            >
              <div className={styles.workloadLabel}>
                <span>{row.name}</span>
                <strong>{row.openTasks} 项</strong>
              </div>
              <span className={styles.workloadTrack}>
                <span
                  style={{ width: `${Math.min(row.capacityPercent, 100)}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
