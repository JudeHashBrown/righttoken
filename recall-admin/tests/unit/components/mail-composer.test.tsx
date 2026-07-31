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
import { MailComposer } from "@/components/mail/mail-composer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

const task = {
  id: "task-1",
  userId: "user-1",
  title: "跟进未支付用户",
  userLabel: "测试用户",
  recipient: "person@example.test",
  suppressed: false
};
const secondTask = {
  ...task,
  id: "task-2",
  userLabel: "第二位用户",
  recipient: "second@example.test"
};
const mailbox = {
  id: "mailbox-1",
  name: "Namecheap 客服邮箱",
  emailAddress: "support@righttoken.test"
};

describe("MailComposer", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("blocks unresolved template variables", () => {
    render(
      <MailComposer
        tasks={[task]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 使用提醒"
        initialBody="你好，[称呼]"
      />
    );

    expect(
      screen.getByText("模板中仍有待填写内容：[称呼]")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "确认并发送" })
    ).toBeDisabled();
  });

  it("shows suppression and prevents sending", () => {
    render(
      <MailComposer
        tasks={[{ ...task, suppressed: true }]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 使用提醒"
        initialBody="你好，我们可以协助你。"
      />
    );

    expect(screen.getByText("该用户已退订，禁止发送")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "确认并发送" })
    ).toBeDisabled();
  });

  it("submits final reviewed content to the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { id: "message-1", status: "SENT" }
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailComposer
        tasks={[task]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 使用提醒"
        initialBody="你好，我们可以协助你。"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "确认并发送" })
    );
    await waitFor(() => {
      expect(
        screen.getByText(
          "邮件已发送，任务已进入等待用户回复"
        )
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mail/send",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"taskId":"task-1"')
      })
    );
    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/mail/send"
    )?.[1] as RequestInit;
    expect(request.body).toContain(
      '"bodyHtml":"<p>你好，我们可以协助你。</p>"'
    );
    expect(request.body).toContain('"assets":[]');
  });

  it("preserves complete HTML when a template is selected", async () => {
    const templateHtml =
      '<!DOCTYPE html><html><head><style>.hero{color:#2563eb}</style></head><body><h1 class="hero">欢迎使用</h1></body></html>';
    const fetchMock = vi.fn().mockImplementation(
      async (url: string) => {
        if (url === "/api/mail/preview") {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                html: templateHtml,
                text: "欢迎使用",
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
              message: { id: "message-html", status: "SENT" }
            })
        };
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailComposer
        tasks={[task]}
        mailboxes={[mailbox]}
        templates={[
          {
            id: "template-html",
            name: "完整 HTML",
            subject: "欢迎",
            bodyText: "欢迎使用",
            bodyHtml: templateHtml,
            assets: []
          }
        ]}
        initialSubject=""
        initialBody=""
      />
    );

    fireEvent.change(screen.getByLabelText("使用模板"), {
      target: { value: "template-html" }
    });
    expect(await screen.findByLabelText("HTML 邮件源码")).toHaveValue(
      templateHtml
    );
    fireEvent.click(
      screen.getByRole("button", { name: "确认并发送" })
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "邮件已发送，任务已进入等待用户回复"
        )
      ).toBeInTheDocument()
    );
    const request = fetchMock.mock.calls.find(
      ([url]) => url === "/api/mail/send"
    )?.[1] as RequestInit;
    expect(request.body).toContain(
      JSON.stringify(templateHtml).slice(1, -1)
    );
  });

  it("submits an edited recipient and resets it when the task changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { id: "message-1", status: "SENT" }
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailComposer
        tasks={[task, secondTask]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 使用提醒"
        initialBody="你好，我们可以协助你。"
      />
    );

    const recipient = screen.getByLabelText("最终收件人");
    fireEvent.change(recipient, {
      target: { value: "manual@example.test" }
    });
    expect(
      screen.getByText("已修改收件邮箱")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("关联任务（可选）"), {
      target: { value: "task-2" }
    });
    expect(recipient).toHaveValue("second@example.test");

    fireEvent.change(recipient, {
      target: { value: "manual@example.test" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认并发送" })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/mail/send",
        expect.objectContaining({
          body: expect.stringContaining(
            '"recipient":"manual@example.test"'
          )
        })
      );
    });
  });

  it("blocks an invalid final recipient", () => {
    render(
      <MailComposer
        tasks={[task]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 使用提醒"
        initialBody="你好，我们可以协助你。"
      />
    );
    fireEvent.change(screen.getByLabelText("最终收件人"), {
      target: { value: "invalid-email" }
    });
    expect(
      screen.getByRole("button", { name: "确认并发送" })
    ).toBeDisabled();
  });

  it("sends proactive mail for a selected user without an existing task", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          message: { id: "message-2", status: "SENT" },
          taskId: "manual-task-1"
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailComposer
        tasks={[]}
        users={[
          {
            id: "user-1",
            label: "测试用户",
            email: "person@example.test",
            suppressed: false,
            paused: false
          }
        ]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 主动联系"
        initialBody="你好，我们可以协助你。"
      />
    );

    fireEvent.change(screen.getByLabelText("选择用户"), {
      target: { value: "user-1" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认并发送" })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/mail/send",
        expect.objectContaining({
          body: expect.stringContaining('"userId":"user-1"')
        })
      );
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.body).not.toContain('"taskId":""');
    expect(
      screen.getByText(
        "邮件已发送，任务已进入等待用户回复"
      )
    ).toBeInTheDocument();
  });

  it("switches to one segment without exposing a recipient field", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          label: "F 组全员",
          total: 12,
          estimatedSkipped: 2
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailComposer
        tasks={[task]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 服务提醒"
        initialBody="你好，我们可以协助你。"
      />
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "指定分组" })
    );

    expect(
      screen.getByLabelText("选择分组")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("最终收件人")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "每位用户将收到独立邮件，无法看到其他收件人邮箱"
      )
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText("预计 12 人，自动跳过 2 人")
      ).toBeInTheDocument();
    });
  });

  it("creates an all-user batch without sending user ids or emails", async () => {
    const fetchMock = vi.fn(
      async (url: string, options?: RequestInit) => {
        if (
          url.startsWith(
            "/api/mail/audience-preview"
          )
        ) {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                label: "全部用户",
                total: 20,
                estimatedSkipped: 3
              })
          };
        }
        expect(url).toBe("/api/mail/batches");
        expect(options?.headers).toEqual(
          expect.objectContaining({
            "content-type": "application/json",
            "idempotency-key": expect.any(String)
          })
        );
        const body = String(options?.body);
        expect(body).toContain('"mode":"ALL"');
        expect(body).not.toContain('"recipient"');
        expect(body).not.toContain('"userId"');
        expect(body).not.toContain("@example.test");
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              id: "batch-1",
              status: "PENDING"
            })
        };
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailComposer
        tasks={[task]}
        mailboxes={[mailbox]}
        initialSubject="RightToken 服务提醒"
        initialBody="你好，我们可以协助你。"
      />
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "全部用户" })
    );
    await waitFor(() => {
      expect(
        screen.getByText("预计 20 人，自动跳过 3 人")
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "确认创建群发"
      })
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "群发任务已创建，可在下方查看进度"
        )
      ).toBeInTheDocument();
    });
  });
});
