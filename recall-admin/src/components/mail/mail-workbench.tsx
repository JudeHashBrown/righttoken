"use client";

import styles from "@/components/workspaces/workspace.module.css";
import {
  MailConversationDetail,
  MailMessageContent
} from "@/components/mail/mail-conversation-detail";
import {
  MailConversationList
} from "@/components/mail/mail-conversation-list";
import {
  MailReplyEditor
} from "@/components/mail/mail-reply-editor";
import {
  UnmatchedMessageAssignment
} from "@/components/mail/unmatched-message-assignment";
import type {
  MailWorkspaceData
} from "@/modules/mail/workspace-query";

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

export function MailWorkbench({
  data
}: {
  data: MailWorkspaceData;
}): React.JSX.Element {
  return (
    <section className={styles.mailWorkbench}>
      <MailConversationList data={data} />
      <div className={styles.mailDetailPane}>
        {data.selected?.kind === "thread" ? (
          <>
            <MailConversationDetail
              thread={data.selected.thread}
            />
            <MailReplyEditor
              canArchiveTemplates={
                data.permissions.canArchiveTemplates
              }
              templates={data.templates}
              thread={data.selected.thread}
            />
          </>
        ) : data.selected?.kind === "unmatched" ? (
          <>
            <header className={styles.mailDetailHeader}>
              <div>
                <h2>{data.selected.message.subject}</h2>
                <p>{data.selected.message.fromAddress}</p>
              </div>
              <time
                dateTime={
                  data.selected.message.receivedAt ??
                  data.selected.message.createdAt
                }
              >
                {dateTime(
                  data.selected.message.receivedAt ??
                    data.selected.message.createdAt
                )}
              </time>
            </header>
            <div className={styles.unmatchedBody}>
              <MailMessageContent
                message={data.selected.message}
              />
            </div>
            <UnmatchedMessageAssignment
              messageId={data.selected.message.id}
              users={data.assignableUsers}
            />
          </>
        ) : (
          <div className={styles.mailSelectionEmpty}>
            <strong>选择一封邮件开始处理</strong>
            <p>
              左侧选择会话后，可查看完整正文、历史往来并直接回复。
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
