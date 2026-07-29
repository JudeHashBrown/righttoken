import styles from "@/components/workspaces/workspace.module.css";
import type {
  MailThreadDetail
} from "@/components/mail/mail-reply-editor";
import {
  MailAssetList
} from "@/components/mail/mail-asset-list";
import {
  operationalLocationLabel
} from "@/modules/users/presentation";

function hydrateMessageHtml(
  bodyHtml: string,
  assets: MailThreadDetail["messages"][number]["assets"]
): string {
  let html = bodyHtml;
  for (const asset of assets) {
    if (
      asset.disposition !== "INLINE" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(asset.id)
    ) {
      continue;
    }
    html = html.replaceAll(
      `data-mail-asset-id="${asset.id}"`,
      `src="${asset.previewUrl}" data-mail-asset-id="${asset.id}"`
    );
  }
  return html;
}

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

type DisplayMessage = Pick<
  MailThreadDetail["messages"][number],
  | "bodyText"
  | "bodyHtml"
  | "externalImagesBlocked"
  | "assets"
>;

export function MailMessageContent({
  message
}: {
  message: DisplayMessage;
}): React.JSX.Element {
  const assets = message.assets ?? [];
  return (
    <>
      <div className={styles.mailMessageBody}>
        {message.bodyHtml ? (
          <div
            className={styles.mailMessageRichBody}
            dangerouslySetInnerHTML={{
              __html: hydrateMessageHtml(
                message.bodyHtml,
                assets
              )
            }}
          />
        ) : (
          message.bodyText || "（无正文）"
        )}
      </div>
      {message.externalImagesBlocked ? (
        <p className={styles.mailPrivacyNotice}>
          为保护隐私，已拦截邮件中的外部图片
        </p>
      ) : null}
      <MailAssetList assets={assets} />
    </>
  );
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
            {operationalLocationLabel(thread.user)}
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
              <MailMessageContent message={message} />
            </li>
          );
        })}
      </ol>
    </>
  );
}
