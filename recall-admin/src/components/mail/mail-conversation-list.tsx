import Link from "next/link";
import styles from "@/components/workspaces/workspace.module.css";
import type {
  MailWorkspaceData
} from "@/modules/mail/workspace-query";

function timeLabel(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

export function MailConversationList({
  data
}: {
  data: MailWorkspaceData;
}): React.JSX.Element {
  return (
    <aside
      aria-label="邮件列表"
      className={styles.mailConversationList}
    >
      <div className={styles.mailListHeader}>
        <strong>邮件与会话</strong>
        <span>{data.items.length} 项</span>
      </div>
      {data.items.length ? (
        <ul className={styles.mailListItems}>
          {data.items.map((item) => {
            const selected = item.id === data.filter.selectedId;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  aria-current={selected ? "page" : undefined}
                  className={styles.mailListLink}
                  href={`/mail?view=${data.filter.view}&selected=${encodeURIComponent(
                    item.id
                  )}`}
                >
                  <span className={styles.mailListTopline}>
                    <strong>{item.title}</strong>
                    <time dateTime={item.occurredAt ?? undefined}>
                      {timeLabel(item.occurredAt)}
                    </time>
                  </span>
                  <span className={styles.mailListSubtitle}>
                    {item.subtitle}
                  </span>
                  <span className={styles.mailListPreview}>
                    {item.preview}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.mailEmptyList}>
          <strong>当前筛选没有邮件</strong>
          <p>新来信或状态变化后会自动显示在这里。</p>
        </div>
      )}
    </aside>
  );
}
