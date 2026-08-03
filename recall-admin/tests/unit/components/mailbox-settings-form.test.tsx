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
import { MailboxSettingsForm } from "@/components/settings/mailbox-settings-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("MailboxSettingsForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("saves an enterprise mailbox without Namecheap defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          mailbox: {
            id: "mailbox-1",
            name: "企业微信邮箱",
            emailAddress: "support@righttoken.test",
            enabled: true
          }
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MailboxSettingsForm />);

    expect(screen.queryByText(/Namecheap/i)).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("mail.privateemail.com")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("邮箱类型")).toHaveValue(
      "WECOM_MAIL"
    );

    fireEvent.change(screen.getByLabelText("对外显示的邮箱地址"), {
      target: { value: "support@righttoken.test" }
    });
    fireEvent.change(
      screen.getByLabelText("登录账号（通常与邮箱地址相同）"),
      {
      target: { value: "support@righttoken.test" }
      }
    );
    fireEvent.change(screen.getByLabelText("邮箱密码"), {
      target: { value: "mailbox-secret-password" }
    });
    fireEvent.change(screen.getByLabelText("发件服务器地址"), {
      target: { value: "smtp.exmail.qq.com" }
    });
    fireEvent.change(screen.getByLabelText("发件服务器端口"), {
      target: { value: "465" }
    });
    fireEvent.change(screen.getByLabelText("收件服务器地址"), {
      target: { value: "imap.exmail.qq.com" }
    });
    fireEvent.change(screen.getByLabelText("收件服务器端口"), {
      target: { value: "993" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存邮箱连接" }));

    await waitFor(() => {
      expect(screen.getByText("邮箱连接已安全保存")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/integrations/mailboxes",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"provider":"WECOM_MAIL"')
      })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain(
      '"password":"mailbox-secret-password"'
    );
  });
});
