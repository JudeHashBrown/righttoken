import Link from "next/link";
import styles from "@/components/workspaces/workspace.module.css";
import {
  getMailWorkspaceOverview
} from "@/modules/admin/workspace-queries";
import { requireWorkspaceMember } from "@/modules/admin/page-access";

const statusLabels = {
  UNASSIGNED: "公共池",
  TODO: "待处理",
  IN_PROGRESS: "处理中",
  WAITING_USER: "等待用户",
  COMPLETED: "已完成",
  PAUSED: "已暂停",
  CANCELLED: "已取消"
} as const;

export default async function MailPage(): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/mail");
  const overview = await getMailWorkspaceOverview(member);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>邮件中心</h1>
          <p>集中查看邮件回复触发的任务，并准备接入客服邮箱会话。</p>
        </div>
      </header>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <span>邮件回复任务</span>
          <strong>{overview.replyTasks}</strong>
          <small>由用户回复自动创建</small>
        </div>
        <div className={styles.statCard}>
          <span>待处理回复</span>
          <strong>{overview.openReplyTasks}</strong>
          <small>尚未完成的邮件任务</small>
        </div>
        <div className={styles.statCard}>
          <span>已退订用户</span>
          <strong>{overview.unsubscribedUsers}</strong>
          <small>发送前将由服务端拦截</small>
        </div>
        <div className={styles.statCard}>
          <span>邮箱连接</span>
          <strong>0 / 2</strong>
          <small>Namecheap 与企业微信邮箱待配置</small>
        </div>
      </div>

      <p className={styles.notice}>
        邮箱账号、SMTP 和 IMAP 尚未配置，因此当前不会真实收发邮件。任务、用户备注和退订状态仍会正常保存。
      </p>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>最近邮件回复任务</h2>
            <p>接入邮箱后，新会话会自动同步到这里</p>
          </div>
        </div>
        {overview.recentTasks.length ? (
          <ul className={styles.list}>
            {overview.recentTasks.map((task) => (
              <li className={styles.listItem} key={task.id}>
                <div>
                  <Link
                    className={styles.primaryLink}
                    href={`/tasks/${task.id}`}
                  >
                    {task.title}
                  </Link>
                  <p>
                    {task.user.displayName ||
                      task.user.externalUserId}{" "}
                    · {task.user.email}
                  </p>
                </div>
                <span className={styles.status}>
                  {statusLabels[task.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <strong>暂无邮件回复任务</strong>
            <p>完成邮箱连接后，用户回复会进入会话并触发运营任务。</p>
          </div>
        )}
      </section>
    </main>
  );
}
