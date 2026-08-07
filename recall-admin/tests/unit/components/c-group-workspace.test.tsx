// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CGroupWorkspace } from "@/components/c-group/c-group-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const data = {
  users: [{
    id: "user-c-1",
    registrationSequence: "50018",
    email: "funded@example.com",
    countryCode: "CN",
    displayName: "林悦"
  }],
  selectedUser: {
    id: "user-c-1",
    registrationSequence: "50018",
    email: "funded@example.com",
    countryCode: "CN",
    displayName: "林悦",
    contact: null,
    inquiryMail: [{
      id: "mail-c-1",
      subject: "协助您完成首次调用",
      status: "SENT" as const,
      occurredAt: new Date("2026-08-06T08:00:00Z")
    }],
    reasons: [],
    guidanceRecords: [],
    maintenanceRecords: []
  }
};

describe("CGroupWorkspace", () => {
  it("uses the same capsule order as D group", () => {
    render(<CGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);

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
  });

  it("prioritizes a quick inquiry about first-call guidance", () => {
    render(<CGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);
    expect(screen.getByText("刚完成充值，可能还不熟悉调用方式")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /邮件询问/ }));
    expect(screen.getByRole("heading", { name: "邮件询问未调用原因" })).toBeInTheDocument();
    expect(screen.getByLabelText("邮件主题")).toHaveValue("协助您完成 RightToken 首次调用");
    expect((screen.getByLabelText("邮件正文") as HTMLTextAreaElement).value).toContain("刚完成充值");
    expect((screen.getByLabelText("邮件正文") as HTMLTextAreaElement).value).toContain("直接回复这封邮件");
    expect(screen.getByLabelText("未调用原因")).toHaveAttribute("placeholder", expect.stringContaining("不熟悉调用方式"));
  });

  it("keeps contact, guidance and maintenance interactions", () => {
    render(<CGroupWorkspace initialData={data} mailboxes={[]} templates={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /登记联系方式/ }));
    expect(screen.getByLabelText("微信号")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /详细辅导/ }));
    expect(screen.getByRole("radio", { name: "拉群指导" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "发教程" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "个性化促销方案" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /日常维护/ }));
    expect(screen.getByLabelText("维护内容")).toBeInTheDocument();
  });
});
