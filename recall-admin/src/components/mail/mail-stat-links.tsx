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
      label: "邮件回复任务",
      value: String(stats.replyTasks),
      detail: "由用户回复自动创建"
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
      detail: "发送前由服务端拦截"
    },
    {
      href: "/mail?view=mailboxes",
      label: "已启用邮箱",
      value: `${stats.enabledMailboxes} / ${stats.totalMailboxes}`,
      detail: "查看邮箱连接状态"
    },
    {
      href: "/mail?view=unmatched",
      label: "人工归档箱",
      value: String(stats.unmatchedMessages),
      detail: "关联无法自动识别的来信"
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
      label: "最近同步",
      value: stats.lastSyncRan ? "已运行" : "未运行",
      detail: "查看各邮箱同步结果"
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
