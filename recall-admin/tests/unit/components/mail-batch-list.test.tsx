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
});
