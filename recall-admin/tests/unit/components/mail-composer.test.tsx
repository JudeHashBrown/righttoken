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
  });
});
