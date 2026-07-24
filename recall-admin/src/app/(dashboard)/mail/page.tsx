import Link from "next/link";
import styles from "@/components/workspaces/workspace.module.css";
import { MailComposer } from "@/components/mail/mail-composer";
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

const mailStatusLabels = {
  DRAFT: "草稿",
  SENT: "已发送",
  RECEIVED: "已收到",
  FAILED: "发送失败",
  UNMATCHED: "待归档"
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
          <span>已启用邮箱</span>
          <strong>
            {overview.mailboxes.filter((mailbox) => mailbox.enabled).length} /{" "}
            {overview.mailboxes.length}
          </strong>
          <small>Namecheap、企业微信或自定义邮箱</small>
        </div>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.statCard}>
          <span>人工归档箱</span>
          <strong>{overview.unmatchedMessages}</strong>
          <small>无法可靠关联用户的来信</small>
        </div>
        <div className={styles.statCard}>
          <span>草稿</span>
          <strong>{overview.draftMessages}</strong>
          <small>尚未完成发送的最终版本</small>
        </div>
        <div className={styles.statCard}>
          <span>发送失败</span>
          <strong>{overview.failedMessages}</strong>
          <small>保留稳定错误码供重新处理</small>
        </div>
        <div className={styles.statCard}>
          <span>最近同步</span>
          <strong>
            {overview.mailboxes.some((mailbox) => mailbox.lastSyncedAt)
              ? "已运行"
              : "未运行"}
          </strong>
          <small>启用邮箱后每两分钟同步一次</small>
        </div>
      </div>

      {overview.mailboxes.some((mailbox) => mailbox.enabled) ? null : (
        <p className={styles.notice}>
          尚未启用邮箱。请先由管理员在系统设置中连接 Namecheap、企业微信邮箱或自定义 SMTP/IMAP。
        </p>
      )}

      <MailComposer
        tasks={overview.eligibleTasks.map((task) => ({
          id: task.id,
          title: task.title,
          userLabel:
            task.user.displayName || task.user.externalUserId,
          recipient: task.user.email,
          suppressed: Boolean(task.user.unsubscribedAt)
        }))}
        mailboxes={overview.mailboxes
          .filter((mailbox) => mailbox.enabled)
          .map((mailbox) => ({
            id: mailbox.id,
            name: mailbox.name,
            emailAddress: mailbox.emailAddress
          }))}
        initialSubject="RightToken 使用提醒"
        initialBody="你好，我们是 RightToken 用户运营团队。如你在使用过程中需要帮助，请直接回复此邮件。"
      />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>最近邮件</h2>
            <p>已发送、已收到、失败和未匹配邮件统一留痕</p>
          </div>
        </div>
        {overview.recentMessages.length ? (
          <ul className={styles.list}>
            {overview.recentMessages.map((message) => (
              <li className={styles.listItem} key={message.id}>
                <div>
                  <strong>{message.subject}</strong>
                  <p>
                    {message.user?.displayName ||
                      message.user?.externalUserId ||
                      message.fromAddress}
                    {" · "}
                    {message.direction === "INBOUND"
                      ? "用户来信"
                      : "运营发送"}
                  </p>
                </div>
                <span className={styles.status}>
                  {mailStatusLabels[message.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <strong>暂无邮件记录</strong>
            <p>发送首封审核邮件或同步到用户回复后会显示在这里。</p>
          </div>
        )}
      </section>

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
