import styles from "@/components/workspaces/workspace.module.css";
import type {
  MailThreadDetail
} from "@/components/mail/mail-reply-editor";

function dateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

export function MailConversationDetail({
  thread
}: {
  thread: MailThreadDetail;
}): React.JSX.Element {
  return (
    <>
      <header className={styles.mailDetailHeader}>
        <div>
          <h2>{thread.subject}</h2>
          <p>
            {thread.user.displayName ||
              thread.user.externalUserId}{" "}
            · {thread.user.email}
          </p>
        </div>
        <div className={styles.mailUserFacts}>
          <span>{thread.user.currentSegment} 组</span>
          <span>
            {[thread.user.countryCode, thread.user.region]
              .filter(Boolean)
              .join(" · ") || "地区待确认"}
          </span>
          <span>
            {thread.user.owner?.displayName || "公共池"}
          </span>
        </div>
      </header>
      <ol
        aria-label="邮件往来记录"
        className={styles.mailTimeline}
      >
        {thread.messages.map((message) => {
          const inbound = message.direction === "INBOUND";
          const occurredAt =
            message.receivedAt ??
            message.sentAt ??
            message.createdAt;
          return (
            <li
              className={
                inbound
                  ? styles.inboundMessage
                  : styles.outboundMessage
              }
              key={message.id}
            >
              <div className={styles.mailMessageMeta}>
                <strong>
                  {inbound ? "用户来信" : "运营回复"}
                </strong>
                <time dateTime={occurredAt}>
                  {dateTime(occurredAt)}
                </time>
              </div>
              <p className={styles.mailMessageAddress}>
                {message.fromAddress} →{" "}
                {message.toAddresses.join("、")}
              </p>
              <p className={styles.mailMessageSubject}>
                {message.subject}
              </p>
              <div className={styles.mailMessageBody}>
                {message.bodyText || "（无正文）"}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
