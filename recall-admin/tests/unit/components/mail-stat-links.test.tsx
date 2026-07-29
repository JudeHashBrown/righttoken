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
    render(
      <MailStatLinks
        stats={{
          replyTasks: 8,
          openReplyTasks: 3,
          unsubscribedUsers: 2,
          enabledMailboxes: 1,
          totalMailboxes: 1,
          unmatchedMessages: 4,
          draftMessages: 2,
          failedMessages: 1,
          lastSyncRan: true
        }}
      />
    );

    expect(
      screen.getByRole("link", { name: /待处理回复/ })
    ).toHaveAttribute("href", "/mail?view=pending");
    expect(
      screen.getByRole("link", { name: /待关联来信/ })
    ).toHaveAttribute("href", "/mail?view=unmatched");
    expect(
      screen.getByRole("link", { name: /发送失败/ })
    ).toHaveAttribute("href", "/mail?view=failed");
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });
});
