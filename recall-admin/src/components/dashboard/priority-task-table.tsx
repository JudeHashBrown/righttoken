import Link from "next/link";
import type { DashboardTask } from "@/modules/reports/dashboard-query";
import {
  presentTaskPriority,
  presentTaskStatus
} from "@/modules/presentation/status";
import styles from "./dashboard.module.css";

function dueLabel(value: Date, now: Date): string {
  const diffMinutes = Math.round(
    (value.getTime() - now.getTime()) / 60_000
  );
  if (diffMinutes < 0) {
    const overdue = Math.abs(diffMinutes);
    if (overdue < 60) return `已逾期 ${overdue} 分钟`;
    return `已逾期 ${Math.floor(overdue / 60)} 小时`;
  }
  if (diffMinutes < 60) return `剩余 ${diffMinutes} 分钟`;
  if (diffMinutes < 24 * 60) {
    return `剩余 ${Math.floor(diffMinutes / 60)} 小时`;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(value);
}

type PriorityTaskTableProps = {
  tasks: DashboardTask[];
  now: Date;
};

export function PriorityTaskTable({
  tasks,
  now
}: PriorityTaskTableProps): React.JSX.Element {
  return (
    <section className={styles.panel} aria-labelledby="priority-heading">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="priority-heading">优先任务</h2>
          <p>需要优先跟进的用户</p>
        </div>
        <Link href="/tasks">查看全部</Link>
      </header>

      {tasks.length === 0 ? (
        <div className={styles.emptyState}>
          <span aria-hidden="true">✓</span>
          <strong>当前没有需要优先处理的任务</strong>
          <p>需要团队优先跟进时，任务会自动出现在这里。</p>
        </div>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.taskTable}>
            <thead>
              <tr>
                <th scope="col">任务 / 用户</th>
                <th scope="col">级别</th>
                <th scope="col">负责人</th>
                <th scope="col">剩余时间</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <Link
                      className={styles.taskTitle}
                      href={`/tasks/${task.id}`}
                    >
                      {task.title}
                    </Link>
                    <span className={styles.taskMeta}>
                      {task.userLabel} · {task.region ?? "地区未知"} ·{" "}
                      {presentTaskStatus(task.status)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.priority} ${
                        styles[`priority${task.priority}`]
                      }`}
                    >
                      {presentTaskPriority(task.priority)}
                    </span>
                  </td>
                  <td className={styles.assignee}>
                    {task.assigneeName ?? "公共任务池"}
                  </td>
                  <td>
                    <span
                      className={
                        task.dueAt.getTime() < now.getTime()
                          ? styles.overdue
                          : styles.due
                      }
                    >
                      {dueLabel(task.dueAt, now)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
