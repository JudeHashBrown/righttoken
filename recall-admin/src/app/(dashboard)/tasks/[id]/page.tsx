import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskActions } from "@/components/tasks/task-actions";
import { UserNoteForm } from "@/components/users/user-note-form";
import styles from "@/components/workspaces/workspace.module.css";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getTaskDetail } from "@/modules/tasks/task-queries";

function dateTime(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(value);
}

const statusLabels = {
  UNASSIGNED: "公共任务池",
  TODO: "待处理",
  IN_PROGRESS: "处理中",
  WAITING_USER: "等待用户",
  COMPLETED: "已完成",
  PAUSED: "已暂停",
  CANCELLED: "已取消"
} as const;

const actionLabels: Record<string, string> = {
  "task.claimed": "领取任务",
  "task.started": "开始处理",
  "task.waiting_user": "等待用户回复",
  "task.completed": "完成任务",
  "task.paused": "暂停任务",
  "task.resumed": "恢复任务",
  "task.cancelled": "取消任务",
  "task.transferred": "转派任务"
};

export default async function TaskDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  const member = await requireWorkspaceMember(`/tasks/${id}`);
  const task = await getTaskDetail(member, id);
  if (!task) notFound();
  const operators = await prisma.member.findMany({
    where: {
      active: true,
      role: { in: ["PRIMARY_ADMIN", "ADMIN", "OPERATOR"] }
    },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true }
  });
  const actorIds = [
    ...new Set(
      task.activities
        .map((activity) => activity.actorId)
        .filter((actorId): actorId is string => Boolean(actorId))
    )
  ];
  const actors = await prisma.member.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, displayName: true }
  });
  const actorNames = new Map(
    actors.map((actor) => [actor.id, actor.displayName])
  );

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <Link className={styles.backLink} href="/tasks">
            ← 返回任务中心
          </Link>
          <h1>{task.title}</h1>
          <p>{task.reason}</p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.status}>
            {statusLabels[task.status]}
          </span>
          <span className={styles.priority}>
            {task.priority}
          </span>
        </div>
      </header>

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>任务详情</h2>
                <p>{task.assignmentReason || "等待分配"}</p>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>状态</span>
                <strong>{statusLabels[task.status]}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>优先级</span>
                <strong>{task.priority}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>截止时间</span>
                <strong>{dateTime(task.dueAt)}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>负责人</span>
                <strong>
                  {task.assignee?.displayName || "公共任务池"}
                </strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>任务来源</span>
                <strong>{task.origin}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>创建时间</span>
                <strong>{dateTime(task.createdAt)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>关联用户</h2>
                <p>处理任务所需的当前用户上下文</p>
              </div>
              <Link
                className={styles.backLink}
                href={`/users/${task.user.id}`}
              >
                打开用户 360
              </Link>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>用户编号</span>
                <strong>{task.user.externalUserId}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>完整邮箱</span>
                <strong>{task.user.email}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>当前分组</span>
                <strong>{task.user.currentSegment}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>国家 / 地区</span>
                <strong>
                  {[task.user.countryCode, task.user.region]
                    .filter(Boolean)
                    .join(" · ") || "待确认"}
                </strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>支付状态</span>
                <strong>{task.user.paymentStatus}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>成功调用</span>
                <strong>
                  {task.user.lastCallAt
                    ? dateTime(task.user.lastCallAt)
                    : "尚无调用"}
                </strong>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>任务活动</h2>
                <p>领取、状态变化和转派记录</p>
              </div>
            </div>
            {task.activities.length ? (
              <ol className={styles.timeline}>
                {task.activities.map((activity) => (
                  <li
                    className={styles.timelineItem}
                    key={activity.id}
                  >
                    <time dateTime={activity.createdAt.toISOString()}>
                      {dateTime(activity.createdAt)}
                    </time>
                    <div>
                      <strong>
                        {actionLabels[activity.action] ||
                          activity.action}
                      </strong>
                      <p>
                        {activity.actorId
                          ? actorNames.get(activity.actorId) ||
                            "已停用成员"
                          : "系统自动执行"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.empty}>
                <strong>暂无任务活动</strong>
                <p>领取或处理任务后，动作记录会显示在这里。</p>
              </div>
            )}
          </section>
        </div>

        <aside>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>处理任务</h2>
                <p>可用动作由当前任务状态和负责人决定</p>
              </div>
            </div>
            <TaskActions
              operators={operators}
              task={{
                id: task.id,
                status: task.status,
                assigneeId: task.assigneeId
              }}
              viewer={{ id: member.id, role: member.role }}
            />
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>添加用户备注</h2>
                <p>备注会同步到用户 360 时间线</p>
              </div>
            </div>
            <UserNoteForm userId={task.user.id} />
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>建议沟通</h2>
                <p>邮件模板将在邮件中心完成后接入</p>
              </div>
            </div>
            <div className={styles.empty}>
              <strong>先人工确认沟通内容</strong>
              <p>当前阶段不会自动向用户发送未经审核的邮件。</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
