"use client";

import Link from "next/link";
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
  MailboxStatusDetail
} from "@/components/mail/mailbox-status-detail";
import {
  UnmatchedMessageAssignment
} from "@/components/mail/unmatched-message-assignment";
import type {
  MailWorkspaceData
} from "@/modules/mail/workspace-query";
import { mailComposeHref } from "@/modules/mail/compose-link";

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
    <section className={styles.mailWorkbench} id="mail-workbench" tabIndex={-1}>
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
        ) : data.selected?.kind === "mailbox" ? (
          <MailboxStatusDetail
            mailbox={data.selected.mailbox}
          />
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
        ) : data.selected?.kind === "message" ? (
          <>
            <header className={styles.mailDetailHeader}>
              <div>
                <h2>{data.selected.message.subject}</h2>
                <p>
                  {data.selected.message.fromAddress} →{" "}
                  {data.selected.message.toAddresses.join("、")}
                </p>
              </div>
              <time
                dateTime={
                  data.selected.message.sentAt ??
                  data.selected.message.createdAt
                }
              >
                {dateTime(
                  data.selected.message.sentAt ??
                    data.selected.message.createdAt
                )}
              </time>
            </header>
            {data.selected.message.status === "BOUNCED" ? (
              <div className={styles.bounceDiagnosticPanel}>
                <strong>最终退信</strong>
                <p>
                  收件服务器已明确标记投递失败。这封邮件不再受
                  24 小时联系保护限制，可以修正后重新发送。
                </p>
                {data.selected.message.bounceStatusCode ? (
                  <p>
                    状态码：
                    {data.selected.message.bounceStatusCode}
                  </p>
                ) : null}
                {data.selected.message.bounceDiagnostic ? (
                  <p>
                    服务器信息：
                    {data.selected.message.bounceDiagnostic}
                  </p>
                ) : null}
                {data.selected.message.userId ? (
                  <Link
                    className={styles.button}
                    href={mailComposeHref({
                      view: "failed",
                      userId: data.selected.message.userId,
                      taskId: data.selected.message.taskId,
                      retryMessageId: data.selected.message.id
                    })}
                  >
                    重新编辑并发送
                  </Link>
                ) : null}
              </div>
            ) : null}
            <div className={styles.unmatchedBody}>
              <MailMessageContent
                message={data.selected.message}
              />
            </div>
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
