import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RevokeOverrideButton } from "@/components/users/revoke-override-button";
import { SegmentOverrideForm } from "@/components/users/segment-override-form";
import { UserNoteForm } from "@/components/users/user-note-form";
import styles from "@/components/workspaces/workspace.module.css";
import { getCurrentMember } from "@/modules/auth/guards";
import { getUser360 } from "@/modules/users/user-queries";

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

function money(minor: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(minor / 100);
}

const taskStatusLabels = {
  UNASSIGNED: "公共池",
  TODO: "待处理",
  IN_PROGRESS: "处理中",
  WAITING_USER: "等待用户",
  COMPLETED: "已完成",
  PAUSED: "已暂停",
  CANCELLED: "已取消"
} as const;

export default async function UserDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const member = await getCurrentMember();
  const { id } = await params;
  if (!member) redirect(`/login?next=/users/${id}`);
  const user = await getUser360(member, id);
  if (!user) notFound();

  const timeline = [
    ...user.events.map((event) => ({
      id: `event-${event.id}`,
      at: event.occurredAt,
      title: event.eventType,
      detail: event.applied
        ? "RightToken 事件已应用"
        : event.errorCode || "事件未改变当前事实"
    })),
    ...user.segmentHistory.map((entry) => ({
      id: `segment-${entry.id}`,
      at: entry.changedAt,
      title: `${entry.fromSegment || "新用户"} → ${entry.toSegment}`,
      detail: entry.reason
    })),
    ...user.notes.map((note) => ({
      id: `note-${note.id}`,
      at: note.createdAt,
      title: `${note.author.displayName} 添加运营备注`,
      detail: note.body
    }))
  ]
    .sort((left, right) => right.at.getTime() - left.at.getTime())
    .slice(0, 100);
  const activeOverride = user.segmentOverrides.find(
    (override) =>
      !override.revokedAt && override.expiresAt > new Date()
  );

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <Link className={styles.backLink} href="/users">
            ← 返回用户中心
          </Link>
          <h1>{user.displayName || user.externalUserId}</h1>
          <p>
            {user.externalUserId} · {user.email}
          </p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.segment}>
            当前分组 {user.currentSegment}
          </span>
        </div>
      </header>

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>用户概况</h2>
                <p>{user.reasonLabel || "等待形成分组原因"}</p>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>完整邮箱</span>
                <strong>{user.email}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>注册 IP</span>
                <strong>{user.registrationIp || "未记录或已过期"}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>国家 / 地区</span>
                <strong>
                  {[user.countryCode, user.region]
                    .filter(Boolean)
                    .join(" · ") || "待确认"}
                </strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>负责人</span>
                <strong>{user.owner?.displayName || "公共池"}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>来源</span>
                <strong>{user.source || "未知"}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>注册时间</span>
                <strong>{dateTime(user.registeredAt)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>支付、调用与余额</h2>
                <p>来自 RightToken 事件的最新业务事实</p>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>支付状态</span>
                <strong>{user.paymentStatus}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>累计支付</span>
                <strong>{money(user.totalPaidMinor)}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>当前余额</span>
                <strong>{money(user.balanceMinor)}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>成功调用</span>
                <strong>{user.successfulCallCount} 次</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>最近调用</span>
                <strong>{dateTime(user.lastCallAt)}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.detailLabel}>邮件状态</span>
                <strong>
                  {user.unsubscribedAt ? "已退订" : "允许联系"}
                </strong>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>运营时间线</h2>
                <p>外部事件、分组迁移和人工备注统一排列</p>
              </div>
            </div>
            {timeline.length ? (
              <ol className={styles.timeline}>
                {timeline.map((entry) => (
                  <li className={styles.timelineItem} key={entry.id}>
                    <time dateTime={entry.at.toISOString()}>
                      {dateTime(entry.at)}
                    </time>
                    <div>
                      <strong>{entry.title}</strong>
                      <p>{entry.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.empty}>
                <strong>暂无时间线记录</strong>
                <p>新的业务事件、任务动作和运营备注会显示在这里。</p>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>相关任务</h2>
                <p>共 {user.tasks.length} 项</p>
              </div>
            </div>
            {user.tasks.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>任务</th>
                      <th>优先级</th>
                      <th>状态</th>
                      <th>负责人</th>
                      <th>截止时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.tasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <Link
                            className={styles.primaryLink}
                            href={`/tasks/${task.id}`}
                          >
                            {task.title}
                          </Link>
                          <span className={styles.secondaryText}>
                            {task.reason}
                          </span>
                        </td>
                        <td>{task.priority}</td>
                        <td>{taskStatusLabels[task.status]}</td>
                        <td>
                          {task.assignee?.displayName || "公共任务池"}
                        </td>
                        <td>{dateTime(task.dueAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>暂无相关任务</strong>
                <p>用户命中需要人工介入的规则后，任务会自动出现在这里。</p>
              </div>
            )}
          </section>
        </div>

        <aside>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>运营备注</h2>
                <p>团队成员可共同维护用户跟进记录</p>
              </div>
            </div>
            <UserNoteForm userId={user.id} />
          </section>

          {member.role !== "OPERATOR" ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>临时分组</h2>
                  <p>最多生效 30 天，到期后恢复自动判断</p>
                </div>
              </div>
              {activeOverride ? (
                <div className={styles.formBody}>
                  <p className={styles.success}>
                    当前临时分组为 {activeOverride.segment}，有效期至{" "}
                    {dateTime(activeOverride.expiresAt)}
                  </p>
                  <p className={styles.secondaryText}>
                    {activeOverride.reason}
                  </p>
                  <RevokeOverrideButton
                    overrideId={activeOverride.id}
                    userId={user.id}
                  />
                </div>
              ) : (
                <SegmentOverrideForm
                  anomalyActive={user.anomalyActive}
                  userId={user.id}
                />
              )}
            </section>
          ) : null}

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>邮件会话</h2>
                <p>将在邮件中心接入后自动同步</p>
              </div>
            </div>
            <div className={styles.empty}>
              <strong>邮件通道尚未配置</strong>
              <p>不影响当前的用户分组、任务处理和运营备注。</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
