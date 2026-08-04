// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import {
  MailBatchList
} from "@/components/mail/mail-batch-list";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

describe("MailBatchList", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    refresh.mockReset();
  });

  it("shows safe progress counts and retries failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "PENDING" })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailBatchList
        batches={[
          {
            id: "batch-1",
            audienceLabel: "F 组全员",
            subject: "服务提醒",
            status: "PARTIAL_FAILURE",
            totalRecipients: 12,
            pendingRecipients: 0,
            sentRecipients: 9,
            skippedRecipients: 2,
            failedRecipients: 1,
            createdAt: "2026-07-30T10:00:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByText("F 组全员")).toBeInTheDocument();
    expect(screen.getByText("成功 9")).toBeInTheDocument();
    expect(screen.getByText("跳过 2")).toBeInTheDocument();
    expect(screen.getByText("失败 1")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("@");

    fireEvent.click(
      screen.getByRole("button", { name: "重试失败项" })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/mail/batches/batch-1/retry",
        expect.objectContaining({ method: "POST" })
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("loads, copies, confirms, and retries final-bounce addresses", async () => {
    const fetchMock = vi.fn(
      async (url: string, init?: RequestInit) => {
        if (!init?.method) {
          return {
            ok: true,
            json: async () => ({
              actionableBounceCount: 2,
              actionableBounceEmails: [
                "a@example.test",
                "z@example.test"
              ],
              actionableBounceList:
                "a@example.test;z@example.test",
              senderMailboxName: "客服邮箱",
              subject: "重要通知"
            })
          };
        }
        return {
          ok: true,
          json: async () => ({ id: "retry-batch-1" })
        };
      }
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MailBatchList
        batches={[
          {
            id: "batch-bounced",
            audienceLabel: "指定用户",
            subject: "重要通知",
            status: "FAILED",
            totalRecipients: 2,
            pendingRecipients: 0,
            sentRecipients: 0,
            skippedRecipients: 0,
            failedRecipients: 2,
            createdAt: "2026-08-04T10:00:00.000Z"
          }
        ]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "查看退信邮箱" })
    );
    expect(
      await screen.findByDisplayValue(
        "a@example.test;z@example.test"
      )
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mail/batches/batch-bounced"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "复制邮箱列表" })
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "a@example.test;z@example.test"
      );
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "重新发送最终退信"
      })
    );
    const dialog = screen.getByRole("dialog", {
      name: "确认重新发送最终退信"
    });
    expect(dialog).toHaveTextContent("2 个最终退信邮箱");
    expect(dialog).toHaveTextContent("客服邮箱");
    expect(dialog).toHaveTextContent("2-4 分钟随机间隔");
    fireEvent.click(
      screen.getByRole("button", { name: "确认创建重发任务" })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/mail/batches/batch-bounced/bounce-retry",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "idempotency-key": expect.stringContaining(
              "bounce-retry-batch-bounced-"
            )
          })
        })
      );
      expect(refresh).toHaveBeenCalled();
    });
  });
});
