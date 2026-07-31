import Link from "next/link";
import type { TaskListItem } from "@/modules/tasks/task-queries";
import styles from "@/components/workspaces/workspace.module.css";
import {
  TableHeaderFilter
} from "@/components/tables/table-header-filter";
import {
  mailComposeHref
} from "@/modules/mail/compose-link";
import {
  presentTaskPriority,
  presentTaskStatus
} from "@/modules/presentation/status";
import { presentSegmentReason } from "@/modules/segmentation/present-reason";

type TaskTableProps = {
  tasks: TaskListItem[];
  now: Date;
  headerFilters?: {
    formId?: string;
    segment: string;
    assigneeId: string;
    assignees: Array<{
      id: string;
      displayName: string;
    }>;
  };
};

function dateTime(value: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(value);
}

function dueLabel(dueAt: Date, now: Date): string {
  const minutes = Math.round(
    (dueAt.getTime() - now.getTime()) / 60_000
  );
  if (minutes < 0) {
    return `已逾期 ${Math.max(1, Math.abs(minutes))} 分钟`;
  }
  if (minutes < 60) {
    return `剩余 ${Math.max(1, minutes)} 分钟`;
  }
  if (minutes < 24 * 60) {
    return `剩余 ${Math.ceil(minutes / 60)} 小时`;
  }
  return dateTime(dueAt);
}

export function TaskTable({
  tasks,
  now,
  headerFilters
}: TaskTableProps): React.JSX.Element {
  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <strong>当前视图没有任务</strong>
        <p>切换任务分类或筛选条件，查看其他需要处理的运营事项。</p>
      </div>
    );
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>优先级</th>
            <th>任务</th>
            <th>用户</th>
            <th>
              {headerFilters ? (
                <TableHeaderFilter
                  formId={headerFilters.formId}
                  label="分组"
                  name="segment"
                  options={[
                    { value: "", label: "全部分组" },
                    ...(["A", "B", "C", "D", "E", "F", "G"] as const).map(
                      (segment) => ({
                        value: segment,
                        label: segment
                      })
                    )
                  ]}
                  value={headerFilters.segment}
                />
              ) : (
                "分组"
              )}
            </th>
            <th>状态</th>
            <th>
              {headerFilters?.assignees.length ? (
                <TableHeaderFilter
                  formId={headerFilters.formId}
                  label="负责人"
                  name="assigneeId"
                  options={[
                    { value: "", label: "全部负责人" },
                    ...headerFilters.assignees.map((assignee) => ({
                      value: assignee.id,
                      label: assignee.displayName
                    }))
                  ]}
                  value={headerFilters.assigneeId}
                />
              ) : (
                "负责人"
              )}
            </th>
            <th>剩余时间</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <span
                  className={`${styles.priority} ${
                    task.priority === "URGENT"
                      ? styles.priorityUrgent
                      : task.priority === "IMPORTANT"
                        ? styles.priorityImportant
                        : styles.priorityNormal
                  }`}
                >
                  {presentTaskPriority(task.priority)}
                </span>
              </td>
              <td>
                <Link
                  className={styles.primaryLink}
                  href={`/tasks/${task.id}`}
                >
                  {task.title}
                </Link>
                <span className={styles.secondaryText}>
                  {presentSegmentReason(task.reason)}
                </span>
              </td>
              <td>
                <Link
                  className={styles.primaryLink}
                  href={`/users/${task.user.id}`}
                >
                  {task.user.externalUserId}
                </Link>
                <Link
                  className={styles.secondaryText}
                  href={mailComposeHref({
                    userId: task.user.id,
                    taskId: task.id
                  })}
                >
                  {task.user.email}
                </Link>
              </td>
              <td>
                <span className={styles.segment}>
                  {task.user.currentSegment}
                </span>
              </td>
              <td>
                <span className={styles.status}>
                  {presentTaskStatus(task.status)}
                </span>
              </td>
              <td>{task.assignee?.displayName || "公共任务池"}</td>
              <td>{dueLabel(task.dueAt, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
