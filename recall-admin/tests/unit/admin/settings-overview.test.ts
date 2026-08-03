import { describe, expect, it } from "vitest";
import {
  buildMailboxChannelHealth,
  buildMailboxIntegrationSummary
} from "@/modules/admin/settings-overview";

describe("buildMailboxIntegrationSummary", () => {
  it("shows an empty state when no mailbox configuration exists", () => {
    expect(buildMailboxIntegrationSummary([])).toEqual({
      name: "客服邮箱",
      configured: false,
      detail: "尚未添加邮箱"
    });
  });

  it("reports real configured and enabled mailbox counts", () => {
    expect(
      buildMailboxIntegrationSummary([
        { enabled: true },
        { enabled: false }
      ])
    ).toEqual({
      name: "客服邮箱",
      configured: true,
      detail: "已添加 2 个邮箱，1 个已启用"
    });
  });

  it("reports dashboard mailbox health from real enabled records", () => {
    expect(
      buildMailboxChannelHealth([
        { enabled: true },
        { enabled: false }
      ])
    ).toEqual({
      channel: "客服邮箱",
      state: "healthy",
      detail: "1 个邮箱可用"
    });
    expect(buildMailboxChannelHealth([])).toEqual({
      channel: "客服邮箱",
      state: "warning",
      detail: "尚未添加邮箱"
    });
  });
});
