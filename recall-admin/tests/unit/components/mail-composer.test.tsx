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

    expect(screen.getByText("仍有未替换变量：[称呼]")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "审核并发送" })
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
      screen.getByRole("button", { name: "审核并发送" })
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
      screen.getByRole("button", { name: "审核并发送" })
    );
    await waitFor(() => {
      expect(screen.getByText("邮件已发送并记录")).toBeInTheDocument();
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
      screen.getByText("当前使用手动收件人")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("关联任务与用户"), {
      target: { value: "task-2" }
    });
    expect(recipient).toHaveValue("second@example.test");

    fireEvent.change(recipient, {
      target: { value: "manual@example.test" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "审核并发送" })
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
      screen.getByRole("button", { name: "审核并发送" })
    ).toBeDisabled();
  });
});
