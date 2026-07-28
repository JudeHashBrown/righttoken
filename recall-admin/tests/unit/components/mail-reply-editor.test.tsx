// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MailReplyEditor
} from "@/components/mail/mail-reply-editor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

const thread = {
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
    owner: { id: "operator-1", displayName: "中国运营" },
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
} as const;

const templates = [
  {
    id: "template-1",
    key: "payment",
    version: 2,
    name: "支付协助",
    locale: "zh-CN",
    subject: "Re: RightToken 支付协助",
    bodyText: "你好，我们可以协助你完成支付。",
    active: true
  }
];

describe("MailReplyEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("copies a selected template and sends the edited final reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { id: "sent-1", status: "SENT" }
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailReplyEditor
        thread={thread}
        templates={templates}
        canArchiveTemplates={false}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "支付协助" }));
    expect(screen.getByLabelText("邮件主题")).toHaveValue(
      "Re: RightToken 支付协助"
    );
    expect(screen.getByLabelText("邮件正文")).toHaveValue(
      "你好，我们可以协助你完成支付。"
    );
    fireEvent.change(screen.getByLabelText("邮件正文"), {
      target: { value: "你好，我们现在协助你完成支付。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送回复" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/mail/reply",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"bodyText":"你好，我们现在协助你完成支付。"'
          )
        })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks replies to an unsubscribed user", () => {
    render(
      <MailReplyEditor
        thread={{
          ...thread,
          user: {
            ...thread.user,
            unsubscribedAt: "2026-07-27T08:00:00.000Z"
          }
        }}
        templates={templates}
        canArchiveTemplates={false}
      />
    );

    expect(
      screen.getByText("该用户已退订，禁止发送邮件")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "发送回复" })
    ).toBeDisabled();
  });
});
