// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MailboxStatusDetail
} from "@/components/mail/mailbox-status-detail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("MailboxStatusDetail", () => {
  afterEach(cleanup);

  it("shows operational copy and recovery controls", () => {
    render(
      <MailboxStatusDetail
        mailbox={{
          id: "mailbox-1",
          name: "Namecheap 客服邮箱",
          emailAddress: "contact@righttoken.ai",
          enabled: true,
          statusText: "连接邮箱服务器超时",
          lastTestedAt: null,
          lastSuccessAt: null,
          lastSyncedAt: null
        }}
      />
    );

    expect(
      screen.getByText("连接邮箱服务器超时")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("IMAP_CONNECTION_TIMEOUT")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "测试连接" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "立即同步" })
    ).toBeEnabled();
  });
});
