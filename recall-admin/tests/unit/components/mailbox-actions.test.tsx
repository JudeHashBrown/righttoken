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
import { MailboxActions } from "@/components/settings/mailbox-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("MailboxActions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tests and manually synchronizes a mailbox", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            received: 2,
            matched: 1,
            unmatched: 1,
            replyTasksCreated: 1
          })
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<MailboxActions mailboxId="mailbox-1" />);

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => {
      expect(screen.getByText("邮箱连接正常")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "立即同步" }));
    await waitFor(() => {
      expect(
        screen.getByText("同步完成：收到 2 封，匹配 1 封")
      ).toBeInTheDocument();
    });
  });
});
