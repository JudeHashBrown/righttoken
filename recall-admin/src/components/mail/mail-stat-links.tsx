import Link from "next/link";
import styles from "@/components/workspaces/workspace.module.css";

type MailStats = {
  replyTasks: number;
  openReplyTasks: number;
  unsubscribedUsers: number;
  enabledMailboxes: number;
  totalMailboxes: number;
  unmatchedMessages: number;
  draftMessages: number;
  failedMessages: number;
  lastSyncRan: boolean;
};

export function MailStatLinks({
  stats
}: {
  stats: MailStats;
}): React.JSX.Element {
  const cards = [
    {
      href: "/mail?view=replies",
      label: "邮件会话",
      value: String(stats.replyTasks),
      detail: "查看用户来信与历史往来"
    },
    {
      href: "/mail?view=pending",
      label: "待处理回复",
      value: String(stats.openReplyTasks),
      detail: "尚未完成的邮件任务"
    },
    {
      href: "/mail?view=unsubscribed",
      label: "已退订用户",
      value: String(stats.unsubscribedUsers),
      detail: "系统会阻止继续发送"
    },
    {
      href: "/mail?view=mailboxes",
      label: "已启用邮箱",
      value: `${stats.enabledMailboxes} / ${stats.totalMailboxes}`,
      detail: "查看邮箱连接状态"
    },
    {
      href: "/mail?view=unmatched",
      label: "待关联来信",
      value: String(stats.unmatchedMessages),
      detail: "为暂时无法识别的来信选择用户"
    },
    {
      href: "/mail?view=drafts",
      label: "草稿",
      value: String(stats.draftMessages),
      detail: "继续处理未完成内容"
    },
    {
      href: "/mail?view=failed",
      label: "发送失败",
      value: String(stats.failedMessages),
      detail: "检查并重新处理"
    },
    {
      href: "/mail?view=sync",
      label: "最近收取邮件",
      value: stats.lastSyncRan ? "已完成" : "尚未执行",
      detail: "查看各邮箱最近一次收信结果"
    }
  ];

  return (
    <div className={styles.cardGrid}>
      {cards.map((card) => (
        <Link
          aria-label={`${card.label} ${card.value}`}
          className={`${styles.statCard} ${styles.statLink}`}
          href={card.href}
          key={card.href}
        >
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <small>{card.detail}</small>
        </Link>
      ))}
    </div>
  );
}
