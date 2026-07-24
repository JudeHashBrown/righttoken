// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/layout/app-header";

let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

describe("AppHeader", () => {
  afterEach(() => {
    pathname = "/dashboard";
    cleanup();
  });

  it.each([
    ["/dashboard", "运营驾驶舱"],
    ["/tasks", "任务中心"],
    ["/tasks/task-1", "任务中心"],
    ["/users", "用户中心"],
    ["/users/user-1", "用户中心"],
    ["/mail", "邮件中心"],
    ["/automation/segments", "分组规则"],
    ["/automation/assignment", "分配规则"],
    ["/automation/notifications", "通知策略"],
    ["/reports", "数据报表"],
    ["/members", "成员与权限"],
    ["/settings", "系统设置"]
  ])("shows the current workspace for %s", (route, label) => {
    pathname = route;

    render(<AppHeader memberName="林小雨" urgentCount={2} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
