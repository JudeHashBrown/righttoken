// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MailBatchList } from "@/components/mail/mail-batch-list";

describe("MailBatchList", () => {
  afterEach(cleanup);

  it("lists each historical batch as one compact record", () => {
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
            retryableFailedRecipients: 1,
            createdAt: "2026-07-30T10:00:00.000Z"
          },
          {
            id: "batch-2",
            audienceLabel: "指定用户",
            subject: "活动通知",
            status: "COMPLETED",
            totalRecipients: 5,
            pendingRecipients: 0,
            sentRecipients: 5,
            skippedRecipients: 0,
            failedRecipients: 0,
            retryableFailedRecipients: 0,
            createdAt: "2026-07-31T10:00:00.000Z"
          }
        ]}
      />
    );

    const history = screen.getByRole("list", { name: "群发历史明细" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("F 组全员");
    expect(rows[0]).toHaveTextContent("服务提醒");
    expect(rows[0]).toHaveTextContent("成功 9");
    expect(rows[0]).toHaveTextContent("失败 1");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the history target when no batch has been sent", () => {
    render(<MailBatchList batches={[]} />);

    expect(screen.getByRole("region", { name: "群发进度" })).toHaveAttribute(
      "id",
      "mail-batch-history"
    );
    expect(screen.getByText("暂无群发记录")).toBeInTheDocument();
  });
});
