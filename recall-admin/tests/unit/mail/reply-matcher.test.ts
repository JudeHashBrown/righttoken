import { describe, expect, it } from "vitest";
import { matchInboundReply } from "@/modules/mail/reply-matcher";

const messages = [
  {
    threadId: "thread-1",
    taskId: "task-1",
    providerMessageId: "<outbound-1@example.test>",
    recipientAddress: "person@example.test",
    mailboxAddress: "support@righttoken.test",
    subject: "Re: RightToken 首次使用",
    sentAt: new Date("2026-07-20T08:00:00.000Z")
  },
  {
    threadId: "thread-2",
    taskId: null,
    providerMessageId: "<outbound-2@example.test>",
    recipientAddress: "other@example.test",
    mailboxAddress: "support@righttoken.test",
    subject: "充值提醒",
    sentAt: new Date("2026-07-21T08:00:00.000Z")
  }
];

describe("matchInboundReply", () => {
  it("prefers an exact In-Reply-To match", () => {
    expect(
      matchInboundReply(
        {
          providerMessageId: "<inbound-1@example.test>",
          inReplyTo: "<outbound-1@example.test>",
          references: [],
          fromAddress: "person@example.test",
          mailboxAddress: "support@righttoken.test",
          subject: "Re: RightToken 首次使用",
          receivedAt: new Date("2026-07-24T08:00:00.000Z")
        },
        messages
      )
    ).toEqual({
      kind: "MATCHED",
      threadId: "thread-1",
      taskId: "task-1"
    });
  });

  it("matches a unique sender, mailbox and subject stem within 30 days", () => {
    expect(
      matchInboundReply(
        {
          providerMessageId: "<inbound-2@example.test>",
          inReplyTo: null,
          references: [],
          fromAddress: "person@example.test",
          mailboxAddress: "support@righttoken.test",
          subject: "RE: Re: RightToken 首次使用",
          receivedAt: new Date("2026-07-24T08:00:00.000Z")
        },
        messages
      )
    ).toEqual({
      kind: "MATCHED",
      threadId: "thread-1",
      taskId: "task-1"
    });
  });

  it("leaves ambiguous sender and subject matches unmatched", () => {
    expect(
      matchInboundReply(
        {
          providerMessageId: "<inbound-3@example.test>",
          inReplyTo: null,
          references: [],
          fromAddress: "person@example.test",
          mailboxAddress: "support@righttoken.test",
          subject: "RightToken 首次使用",
          receivedAt: new Date("2026-07-24T08:00:00.000Z")
        },
        [
          ...messages,
          {
            ...messages[0]!,
            threadId: "thread-3",
            providerMessageId: "<outbound-3@example.test>"
          }
        ]
      )
    ).toEqual({ kind: "UNMATCHED", reason: "AMBIGUOUS_FALLBACK" });
  });
});
