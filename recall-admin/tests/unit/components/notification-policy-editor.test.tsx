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
import { NotificationPolicyEditor } from "@/components/automation/notification-policy-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

const initialConfig = {
  urgent: {
    wecom: true,
    email: true,
    repeatMinutes: 15,
    escalateMinutes: 30
  },
  important: {
    wecom: true,
    email: false,
    repeatMinutes: 0,
    escalateMinutes: 120
  },
  normal: {
    wecom: false,
    email: false,
    repeatMinutes: 0,
    escalateMinutes: 1440
  },
  dailyDigestTime: "10:00"
};

describe("NotificationPolicyEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("publishes channel, repeat, escalation and digest settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: 3 })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<NotificationPolicyEditor initialConfig={initialConfig} />);
    fireEvent.change(screen.getByLabelText("每日汇总时间"), {
      target: { value: "09:30" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存提醒设置" }));

    await waitFor(() => {
      expect(screen.getByText("提醒设置 v3 已保存")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/automation/notification-policies",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"dailyDigestTime":"09:30"')
      })
    );
  });
});
