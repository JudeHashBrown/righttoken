import Link from "next/link";
import type {
  SegmentCode,
  TaskPriority,
  TaskStatus
} from "@/generated/prisma/client";
import { TaskTable } from "@/components/tables/task-table";
import styles from "@/components/workspaces/workspace.module.css";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import {
  findTasks,
  type TaskView
} from "@/modules/tasks/task-queries";
import { taskShortcutFilters } from "@/modules/tasks/task-shortcut";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

const tabs: Array<{ value: TaskView; label: string }> = [
  { value: "mine", label: "我的任务" },
  { value: "pool", label: "公共任务池" },
  { value: "waiting", label: "待回复" },
  { value: "overdue", label: "已逾期" },
  { value: "all", label: "全部任务" }
];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function preservedParams(
  params: Record<string, string | string[] | undefined>,
  excluded: string[]
): Array<[string, string]> {
  return Object.entries(params).flatMap(([key, value]) => {
    const item = first(value);
    return item && !excluded.includes(key) ? [[key, item]] : [];
  });
}

function tabHref(
  params: Record<string, string | string[] | undefined>,
  view: TaskView
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const item = first(value);
    if (item && !["view", "cursor"].includes(key)) {
      query.set(key, item);
    }
  }
  query.set("view", view);
  return `/tasks?${query.toString()}`;
}

export default async function TasksPage({
  searchParams
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/tasks");
  const params = await searchParams;
  const requestedView = first(params.view) as TaskView;
  const view = tabs.some((tab) => tab.value === requestedView)
    ? requestedView
    : member.role === "OPERATOR"
      ? "mine"
      : "all";
  const status = first(params.status);
  const priority = first(params.priority);
  const segment = first(params.segment);
  const now = new Date();
  const shortcut = taskShortcutFilters(
    {
      due: first(params.due),
      origin: first(params.origin),
      priority,
      scope: first(params.scope),
      recent: first(params.recent)
    },
    now
  );
  const shortcutLabel =
    priority === "URGENT" &&
    shortcut.label === "尚未完成的任务"
      ? "尚未完成的紧急任务"
      : shortcut.label;
  const page = await findTasks(member, {
    view,
    search: first(params.search),
    statuses: status
      ? [status as TaskStatus]
      : shortcut.statuses,
    priorities: priority ? [priority as TaskPriority] : undefined,
    origins: shortcut.origins,
    segments: /^[A-G]$/.test(segment)
      ? [segment as SegmentCode]
      : undefined,
    assigneeId: first(params.assigneeId) || undefined,
    dueFrom: shortcut.dueFrom,
    dueBefore: shortcut.dueBefore,
    createdFrom: shortcut.createdFrom,
    cursor: first(params.cursor) || undefined,
    pageSize: 30,
    now
  });
  const operators =
    member.role === "OPERATOR"
      ? []
      : await prisma.member.findMany({
          where: { active: true },
          orderBy: { displayName: "asc" },
          select: { id: true, displayName: true }
        });

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>任务中心</h1>
          <p>
            领取公共任务、处理自己的任务，并根据紧急程度和剩余时间
            安排跟进顺序。
          </p>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="任务视图">
        {tabs.map((tab) => (
          <Link
            aria-current={view === tab.value ? "page" : undefined}
            className={`${styles.tab} ${
              view === tab.value ? styles.tabActive : ""
            }`}
            href={tabHref(params, tab.value)}
            key={tab.value}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {shortcutLabel ? (
        <p className={styles.notice}>当前筛选：{shortcutLabel}</p>
      ) : null}

      <form className={styles.filterBar}>
        <input name="view" type="hidden" value={view} />
        {segment ? (
          <input name="segment" type="hidden" value={segment} />
        ) : null}
        {first(params.assigneeId) ? (
          <input
            name="assigneeId"
            type="hidden"
            value={first(params.assigneeId)}
          />
        ) : null}
        {first(params.due) ? (
          <input
            name="due"
            type="hidden"
            value={first(params.due)}
          />
        ) : null}
        {first(params.origin) ? (
          <input
            name="origin"
            type="hidden"
            value={first(params.origin)}
          />
        ) : null}
        {first(params.scope) ? (
          <input
            name="scope"
            type="hidden"
            value={first(params.scope)}
          />
        ) : null}
        {first(params.recent) ? (
          <input
            name="recent"
            type="hidden"
            value={first(params.recent)}
          />
        ) : null}
        <div className={`${styles.field} ${styles.fieldGrow}`}>
          <label htmlFor="task-search">搜索任务</label>
          <input
            className={styles.input}
            defaultValue={first(params.search)}
            id="task-search"
            name="search"
            placeholder="任务标题、原因、用户编号、邮箱或姓名"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="task-priority">优先级</label>
          <select
            className={styles.select}
            defaultValue={priority}
            id="task-priority"
            name="priority"
          >
            <option value="">全部优先级</option>
            <option value="URGENT">紧急</option>
            <option value="IMPORTANT">重要</option>
            <option value="NORMAL">普通</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="task-status">状态</label>
          <select
            className={styles.select}
            defaultValue={status}
            id="task-status"
            name="status"
          >
            <option value="">全部状态</option>
            <option value="UNASSIGNED">公共池</option>
            <option value="TODO">待处理</option>
            <option value="IN_PROGRESS">处理中</option>
            <option value="WAITING_USER">等待用户</option>
            <option value="PAUSED">已暂停</option>
            <option value="COMPLETED">已完成</option>
            <option value="CANCELLED">已取消</option>
          </select>
        </div>
        <button className={styles.button} type="submit">
          应用筛选
        </button>
        <Link
          className={styles.secondaryButton}
          href={`/tasks?view=${view}`}
        >
          清除
        </Link>
      </form>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{tabs.find((tab) => tab.value === view)?.label}</h2>
            <p>本页 {page.items.length} 项任务</p>
          </div>
        </div>
        <form action="/tasks" id="task-table-filters">
          {preservedParams(params, [
            "cursor",
            "segment",
            "assigneeId"
          ]).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          {!first(params.view) ? (
            <input name="view" type="hidden" value={view} />
          ) : null}
        </form>
        <TaskTable
          headerFilters={{
            formId: "task-table-filters",
            segment,
            assigneeId: first(params.assigneeId),
            assignees: operators
          }}
          now={now}
          tasks={page.items}
        />
      </section>

      {page.nextCursor ? (
        <nav className={styles.pagination} aria-label="任务分页">
          <Link
            className={styles.secondaryButton}
            href={`${tabHref(params, view)}&cursor=${page.nextCursor}`}
          >
            下一页
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
