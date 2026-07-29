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

  it("fills Namecheap defaults and saves credentials server-side", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          mailbox: {
            id: "mailbox-1",
            name: "Namecheap 客服邮箱",
            emailAddress: "support@righttoken.test",
            enabled: true
          }
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<MailboxSettingsForm />);

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
    expect(screen.getByLabelText("发件服务器地址")).toHaveValue(
      "mail.privateemail.com"
    );
    expect(screen.getByLabelText("收件服务器地址")).toHaveValue(
      "mail.privateemail.com"
    );
    fireEvent.click(screen.getByRole("button", { name: "保存邮箱连接" }));

    await waitFor(() => {
      expect(screen.getByText("邮箱连接已安全保存")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/integrations/mailboxes",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"password":"mailbox-secret-password"')
      })
    );
  });
});
