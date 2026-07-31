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
      bodyHtml: "<p>我需要支付方面的帮助。</p>",
      externalImagesBlocked: false,
      assets: [],
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
    bodyHtml:
      '<p>你好，我们可以协助你完成支付。</p><img data-mail-asset-id="asset-1" alt="支付说明">',
    assets: [
      {
        id: "asset-1",
        fileName: "payment-guide.webp",
        contentType: "image/webp",
        byteSize: 300,
        width: 80,
        height: 60,
        previewUrl: "/api/mail/assets/asset-1",
        disposition: "INLINE" as const,
        cid: "asset-1@righttoken",
        sortOrder: 0
      }
    ],
    active: true
  },
  {
    id: "template-2",
    key: "disabled-payment",
    version: 1,
    name: "已停用支付模板",
    locale: "zh-CN",
    subject: "已停用主题",
    bodyText: "这段内容不应出现在回复模板中。",
    bodyHtml: "<p>这段内容不应出现在回复模板中。</p>",
    assets: [],
    active: false
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

    expect(
      screen.queryByRole("tab", { name: "已停用支付模板" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "支付协助" }));
    expect(screen.getByLabelText("邮件主题")).toHaveValue(
      "Re: RightToken 支付协助"
    );
    expect(
      screen.getByRole("textbox", { name: "邮件正文" })
    ).toHaveTextContent(
      "你好，我们可以协助你完成支付。"
    );
    expect(screen.getByAltText("支付说明")).toBeInTheDocument();
    const editor = screen.getByRole("textbox", {
      name: "邮件正文"
    });
    editor.innerHTML =
      '<p>你好，我们现在协助你完成支付。</p><img data-mail-asset-id="asset-1" alt="支付说明">';
    fireEvent.input(editor);
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
    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/mail/reply"
    )?.[1] as RequestInit;
    expect(request.body).toContain('"bodyHtml"');
    expect(request.body).toContain('"asset-1"');
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

  it("preserves a complete HTML template when replying", async () => {
    const bodyHtml =
      '<!DOCTYPE html><html><head><style>.reply{color:#2563eb}</style></head><body><table><tbody><tr><td class="reply">完整回复</td></tr></tbody></table></body></html>';
    const fetchMock = vi.fn().mockImplementation(
      async (url: string) => {
        if (url === "/api/mail/preview") {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                html: bodyHtml,
                text: "完整回复",
                diagnostics: {
                  removedTags: [],
                  removedAttributes: [],
                  blockedUrls: 0,
                  externalImageCount: 0,
                  hasDangerousContent: false
                },
                visualEditorCompatible: false,
                unresolvedVariables: [],
                canSend: true
              })
          };
        }
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              message: { id: "sent-html", status: "SENT" }
            })
        };
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailReplyEditor
        thread={thread}
        templates={[
          {
            ...templates[0],
            bodyText: "完整回复",
            bodyHtml,
            assets: []
          }
        ]}
        canArchiveTemplates={false}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "支付协助" }));
    expect(screen.getByLabelText("HTML 邮件源码")).toHaveValue(
      bodyHtml
    );
    fireEvent.click(
      screen.getByRole("button", { name: "发送回复" })
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/mail/reply",
        expect.objectContaining({ method: "POST" })
      )
    );
    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/mail/reply"
    )?.[1] as RequestInit;
    expect(request.body).toContain(
      JSON.stringify(bodyHtml).slice(1, -1)
    );
  });
});
