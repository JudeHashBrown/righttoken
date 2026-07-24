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
import { SegmentRuleEditor } from "@/components/automation/segment-rule-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("SegmentRuleEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("publishes configurable A–E observation windows", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: 4 })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SegmentRuleEditor
        initialConfig={{
          registrationUnpaidMs: 2 * 60 * 60 * 1000,
          checkoutUnpaidMs: 30 * 60 * 1000,
          paidWithoutCallMs: 24 * 60 * 60 * 1000,
          inactiveMs: 7 * 24 * 60 * 60 * 1000,
          emptyBalanceMinor: 0,
          emptyBalanceReminderMs: 3 * 24 * 60 * 60 * 1000
        }}
      />
    );

    fireEvent.change(screen.getByLabelText("A 组观察时长（小时）"), {
      target: { value: "3" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布分组规则" }));

    await waitFor(() => {
      expect(screen.getByText("分组规则 v4 已发布")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/automation/segment-rules",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"registrationUnpaidMs":10800000')
      })
    );
  });
});
