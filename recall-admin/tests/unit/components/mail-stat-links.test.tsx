// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  MailStatLinks
} from "@/components/mail/mail-stat-links";

describe("MailStatLinks", () => {
  afterEach(cleanup);

  it("turns every mail statistic into a filter link", () => {
    const { container } = render(
      <MailStatLinks
        batchCount={6}
        currentView="sent"
        stats={{
          replyTasks: 8,
          openReplyTasks: 3,
          unsubscribedUsers: 2,
          enabledMailboxes: 1,
          totalMailboxes: 1,
          unmatchedMessages: 4,
          draftMessages: 2,
          sentMessages: 12,
          failedMessages: 1,
          lastSyncRan: true
        }}
      />
    );

    expect(
      screen.getByRole("link", { name: /待处理回复/ })
    ).toHaveAttribute("href", "/mail?view=pending#mail-workbench");
    expect(
      screen.getByRole("link", { name: /待关联来信/ })
    ).toHaveAttribute("href", "/mail?view=unmatched#mail-workbench");
    expect(
      screen.getByRole("link", { name: /发送失败/ })
    ).toHaveAttribute("href", "/mail?view=failed#mail-workbench");
    expect(
      screen.getByRole("link", { name: /已发送 12/ })
    ).toHaveAttribute("href", "/mail?view=sent#mail-workbench");
    expect(
      screen.getByRole("link", { name: /群发进度 6/ })
    ).toHaveAttribute(
      "href",
      "/mail?view=sent&batchHistory=1#mail-batch-history"
    );
    expect(screen.getAllByRole("link")).toHaveLength(10);
    expect(container.firstElementChild?.className).toContain(
      "mailStatGrid"
    );
  });
});
