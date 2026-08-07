// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DGroupWorkspace } from "@/components/d-group/d-group-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const data = {
  users: [{
    id: "user-d-1",
    registrationSequence: "40018",
    email: "inactive@example.com",
    countryCode: "CN",
    displayName: "陈晨"
  }],
  selectedUser: {
    id: "user-d-1",
    registrationSequence: "40018",
    email: "inactive@example.com",
    countryCode: "CN",
    displayName: "陈晨",
    contact: null,
    inquiryMail: [{
      id: "mail-d-1",
      subject: "了解近期未调用的原因",
      status: "SENT" as const,
      occurredAt: new Date("2026-08-05T08:00:00Z")
    }],
    reasons: [{
      id: "reason-1",
      body: "客户暂时没有合适的使用场景",
      createdAt: new Date("2026-08-05T09:00:00Z"),
      actorName: "主管理员"
    }],
    guidanceRecords: [{
      id: "guide-1",
      category: "TUTORIAL" as const,
      body: "已发送 API 快速入门教程",
      createdAt: new Date("2026-08-05T10:00:00Z"),
      actorName: "主管理员"
    }],
    maintenanceRecords: []
  }
};

describe("DGroupWorkspace", () => {
  it("shows username, inquiry, contact, guidance and maintenance in order", () => {
    render(<DGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);

    const actions = screen.getAllByRole("button").filter((button) =>
      ["邮件询问", "登记联系方式", "详细辅导", "日常维护"].some((label) =>
        button.textContent?.includes(label)
      )
    );
    expect(actions.map((button) => button.textContent)).toEqual([
      expect.stringContaining("邮件询问"),
      expect.stringContaining("登记联系方式"),
      expect.stringContaining("详细辅导"),
      expect.stringContaining("日常维护")
    ]);
    expect(screen.getAllByText("陈晨").length).toBeGreaterThan(0);
  });

  it("opens the mail composer, mail history and manual reason record", () => {
    render(<DGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /邮件询问/ }));

    expect(screen.getByRole("heading", { name: "邮件询问未调用原因" })).toBeInTheDocument();
    expect(screen.getByLabelText("邮件主题")).toBeInTheDocument();
    expect(screen.getByText("了解近期未调用的原因")).toBeInTheDocument();
    expect(screen.getByLabelText("未调用原因")).toBeInTheDocument();
    expect(screen.getByText("客户暂时没有合适的使用场景")).toBeInTheDocument();
  });

  it("records group guidance, tutorials and personalized promotions", () => {
    render(<DGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /详细辅导/ }));

    expect(screen.getByRole("radio", { name: "拉群指导" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "发教程" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "个性化促销方案" })).toBeInTheDocument();
    expect(screen.getByLabelText("辅导记录")).toBeInTheDocument();
    expect(screen.getByText("已发送 API 快速入门教程")).toBeInTheDocument();
  });

  it("reuses contact and maintenance interactions", () => {
    render(<DGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /登记联系方式/ }));
    expect(screen.getByLabelText("微信号")).toBeInTheDocument();
    expect(screen.getByLabelText("Telegram")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /日常维护/ }));
    expect(screen.getByLabelText("维护内容")).toBeInTheDocument();
  });
});
