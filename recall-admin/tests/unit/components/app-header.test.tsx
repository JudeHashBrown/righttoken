// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/layout/app-header";

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

const mainSiteUrl = "https://righttoken.ai/dashboard";

describe("AppHeader", () => {
  afterEach(() => {
    pathname = "/dashboard";
    cleanup();
  });

  it.each([
    ["/dashboard", "用户运营概览"],
    ["/groups/b", "B-未完成支付"],
    ["/groups/a", "A-仅注册"],
    ["/groups/e", "E-余额不足"],
    ["/groups/d", "D-长期未调用"],
    ["/groups/c", "C-充值未调用"],
    ["/users", "用户中心"],
    ["/users/user-1", "用户中心"],
    ["/mail", "邮件中心"],
    ["/automation/segments", "用户分组"],
    ["/automation/assignment", "客户分配"],
    ["/automation/notifications", "提醒设置"],
    ["/reports", "数据报表"],
    ["/members", "成员与权限"],
    ["/settings", "系统设置"]
  ])("shows the current workspace for %s", (route, label) => {
    pathname = route;

    render(
      <AppHeader
        memberName="林小雨"
        mainSiteUrl={mainSiteUrl}
      />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("does not expose standalone logout controls", () => {
    render(
      <AppHeader
        memberName="林小雨"
        mainSiteUrl={mainSiteUrl}
      />
    );

    expect(
      screen.queryByRole("button", { name: "退出" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("退出")
    ).not.toBeInTheDocument();
  });

  it("does not expose task-center controls", () => {
    render(
      <AppHeader
        memberName="林小雨"
        mainSiteUrl={mainSiteUrl}
      />
    );

    expect(screen.queryByRole("link", { name: /紧急任务/ })).not.toBeInTheDocument();
    expect(screen.queryByText("任务中心")).not.toBeInTheDocument();
  });

  it("returns to the configured RightToken dashboard in the same tab", () => {
    render(
      <AppHeader
        memberName="主管理员"
        mainSiteUrl={mainSiteUrl}
      />
    );

    const returnLink = screen.getByRole("link", {
      name: "返回主站"
    });

    expect(returnLink).toHaveAttribute("href", mainSiteUrl);
    expect(returnLink).not.toHaveAttribute("target");
  });
});
