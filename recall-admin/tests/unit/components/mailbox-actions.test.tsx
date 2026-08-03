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
    render(
      <MailboxActions
        mailboxId="mailbox-1"
        mailboxName="企业微信邮箱"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => {
      expect(
        screen.getByText(
          "收信和发信连接均正常；测试连接不会收取邮件。"
        )
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "立即收取邮件" }));
    await waitFor(() => {
      expect(
        screen.getByText(
          "收信完成：收到 2 封，已关联 1 封，未匹配 1 封"
        )
      ).toBeInTheDocument();
    });
  });

  it("shows a Chinese recovery message instead of an internal error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            code: "IMAP_CONNECTION_TIMEOUT"
          })
      })
    );
    render(
      <MailboxActions
        mailboxId="mailbox-1"
        mailboxName="企业微信邮箱"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "立即收取邮件" })
    );
    await waitFor(() => {
      expect(
        screen.getByText("连接邮箱服务器超时")
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText("IMAP_CONNECTION_TIMEOUT")
    ).not.toBeInTheDocument();
  });

  it("does not delete when the administrator cancels confirmation", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <MailboxActions
        mailboxId="mailbox-1"
        mailboxName="企业微信邮箱"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "删除邮箱" })
    );

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("历史邮件和群发记录会保留")
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permanently removes mailbox credentials after confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ mailbox: { id: "mailbox-1" } })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <MailboxActions
        mailboxId="mailbox-1"
        mailboxName="企业微信邮箱"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "删除邮箱" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/integrations/mailboxes/mailbox-1",
        { method: "DELETE" }
      );
    });
    expect(
      screen.getByText("邮箱配置已删除，历史邮件和群发记录已保留。")
    ).toBeInTheDocument();
  });

  it("keeps the mailbox available when credential removal fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            code: "MAILBOX_CONFIGURATION_DELETE_FAILED"
          })
      })
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <MailboxActions
        mailboxId="mailbox-1"
        mailboxName="企业微信邮箱"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "删除邮箱" })
    );

    await waitFor(() => {
      expect(
        screen.getByText("邮箱配置删除失败，原有数据未改变。")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "删除邮箱" })
    ).toBeEnabled();
  });
});
