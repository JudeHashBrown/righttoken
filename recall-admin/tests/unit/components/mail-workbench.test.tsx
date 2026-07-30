// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MailWorkbench
} from "@/components/mail/mail-workbench";
import type {
  MailWorkspaceData
} from "@/modules/mail/workspace-query";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

const data = {
  filter: { view: "pending", selectedId: "thread-1" },
  stats: {
    replyTasks: 1,
    openReplyTasks: 1,
    unsubscribedUsers: 0,
    enabledMailboxes: 1,
    totalMailboxes: 1,
    unmatchedMessages: 0,
    draftMessages: 0,
    failedMessages: 0,
    lastSyncRan: true
  },
  items: [
    {
      id: "thread-1",
      kind: "THREAD",
      title: "RightToken 支付协助",
      subtitle: "测试用户",
      preview: "我需要支付方面的帮助。",
      occurredAt: "2026-07-27T09:00:00.000Z",
      status: "RECEIVED"
    }
  ],
  selected: {
    kind: "thread",
    thread: {
      id: "thread-1",
      subject: "RightToken 支付协助",
      user: {
        id: "user-1",
        externalUserId: "RT-001",
        displayName: "测试用户",
        email: "person@example.test",
        currentSegment: "B",
        countryCode: "CN",
        region: "广东",
        owner: {
          id: "operator-1",
          displayName: "中国运营"
        },
        unsubscribedAt: null,
        pausedAt: null,
        task: {
          id: "task-1",
          title: "回复用户邮件",
          status: "TODO",
          assigneeId: "operator-1"
        }
      },
      mailbox: {
        id: "mailbox-1",
        name: "客服邮箱",
        emailAddress: "support@righttoken.test",
        enabled: true
      },
      messages: [
        {
          id: "message-1",
          direction: "INBOUND",
          status: "RECEIVED",
          fromAddress: "person@example.test",
          toAddresses: ["support@righttoken.test"],
          subject: "Re: RightToken 支付协助",
          bodyText: "我需要支付方面的帮助。",
          sentAt: null,
          receivedAt: "2026-07-27T09:00:00.000Z",
          createdAt: "2026-07-27T09:00:00.000Z"
        }
      ]
    }
  },
  templates: [
    {
      id: "template-1",
      key: "payment",
      version: 1,
      name: "支付协助",
      locale: "zh-CN",
      subject: "Re: RightToken 支付协助",
      bodyText: "你好，我们可以协助你。",
      active: true
    }
  ],
  mailboxes: [],
  assignableUsers: [],
  permissions: { canArchiveTemplates: false }
} as unknown as MailWorkspaceData;

describe("MailWorkbench", () => {
  afterEach(cleanup);

  it("shows list, full conversation and reply templates in one workspace", () => {
    render(<MailWorkbench data={data} />);

    expect(
      screen.getByRole("link", { name: /RightToken 支付协助/ })
    ).toBeInTheDocument();
    const timeline = screen.getByRole("list", { name: "邮件往来记录" });
    expect(
      within(timeline).getByText("我需要支付方面的帮助。")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "支付协助" })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("准备接入客服邮箱会话")
    ).not.toBeInTheDocument();
  });

  it("shows the complete selected sent message without reply controls", () => {
    const sentData = {
      ...data,
      filter: { view: "sent", selectedId: "sent-1" },
      items: [
        {
          id: "sent-1",
          kind: "MESSAGE",
          title: "RightToken 使用提醒",
          subtitle: "person@example.test",
          preview: "这是一封已经发送的邮件。",
          occurredAt: "2026-07-29T09:00:00.000Z",
          status: "已发送"
        }
      ],
      selected: {
        kind: "message",
        message: {
          id: "sent-1",
          fromAddress: "support@righttoken.test",
          toAddresses: ["person@example.test"],
          subject: "RightToken 使用提醒",
          bodyText: "这是一封已经发送的邮件。",
          bodyHtml: null,
          externalImagesBlocked: false,
          assets: [],
          sentAt: "2026-07-29T09:00:00.000Z",
          createdAt: "2026-07-29T08:59:00.000Z"
        }
      }
    } as unknown as MailWorkspaceData;

    render(<MailWorkbench data={sentData} />);

    expect(
      screen.getByRole("heading", {
        name: "RightToken 使用提醒"
      })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("这是一封已经发送的邮件。")
    ).toHaveLength(2);
    expect(
      screen.getByText(
        "support@righttoken.test → person@example.test"
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /发送回复/ })
    ).not.toBeInTheDocument();
  });
});
