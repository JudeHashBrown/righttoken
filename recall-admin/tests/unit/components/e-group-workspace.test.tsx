// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EGroupWorkspace } from "@/components/e-group/e-group-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const data = {
  users: [{
    id: "user-e-1",
    registrationSequence: "50018",
    email: "low-balance@example.com",
    countryCode: "CN",
    displayName: "王明"
  }],
  selectedUser: {
    id: "user-e-1",
    registrationSequence: "50018",
    email: "low-balance@example.com",
    countryCode: "CN",
    displayName: "王明",
    totalPaidMinor: 15_000,
    balanceCurrency: "USD",
    contact: null,
    rechargeHistory: [{
      id: "payment-1",
      occurredAt: new Date("2026-08-01T08:00:00Z"),
      amountMinor: 10_000,
      currency: "USD",
      giftDetail: "首充多赠 5%"
    }],
    outreach: {
      mail: [{
        id: "mail-1",
        subject: "余额不足提醒",
        status: "SENT" as const,
        occurredAt: new Date("2026-08-05T08:00:00Z")
      }],
      wechat: []
    },
    latestCarePlan: null,
    maintenanceRecords: []
  }
};

describe("EGroupWorkspace", () => {
  it("shows the required five-step action order", () => {
    render(<EGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);

    const actions = screen.getAllByRole("button").filter((button) =>
      ["登记联系方式", "催促复充", "个性化维护方案", "日常维护"].some((label) =>
        button.textContent?.includes(label)
      )
    );
    expect(actions.map((button) => button.textContent)).toEqual([
      expect.stringContaining("登记联系方式"),
      expect.stringContaining("催促复充"),
      expect.stringContaining("个性化维护方案"),
      expect.stringContaining("日常维护")
    ]);
    expect(screen.getAllByText("王明").length).toBeGreaterThan(0);
  });

  it("opens email and WeChat follow-up records from the recharge action", () => {
    render(<EGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /催促复充/ }));

    expect(screen.getByRole("button", { name: "邮件催" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "微信催" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "邮件催" }));
    expect(screen.getByRole("heading", { name: "邮件催促复充" })).toBeInTheDocument();
    expect(screen.getByText("余额不足提醒")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "微信催" }));
    expect(screen.getByLabelText("催促过程描述")).toBeInTheDocument();
    expect(screen.getByLabelText("沟通截图")).toBeInTheDocument();
  });

  it("shows recharge details and accepts a personalized care plan", () => {
    render(<EGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /个性化维护方案/ }));

    expect(screen.getByText("累计充值 USD 150.00")).toBeInTheDocument();
    expect(screen.getByText("USD 100.00")).toBeInTheDocument();
    expect(screen.getByText("首充多赠 5%")).toBeInTheDocument();
    expect(screen.getByLabelText("最新个性化维护方案")).toBeInTheDocument();
  });
});
