// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard"
}));

function member(role: "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR") {
  return {
    id: `member-${role.toLowerCase()}`,
    displayName: role === "OPERATOR" ? "林小雨" : "主管理员",
    email: `${role.toLowerCase()}@example.test`,
    role
  };
}

describe("AppSidebar", () => {
  afterEach(cleanup);

  it("shows day-to-day navigation and hides management from operators", () => {
    render(
      <AppSidebar
        member={member("OPERATOR")}
        unreadTasks={28}
        unreadMail={17}
      />
    );

    expect(screen.getByText("运营驾驶舱")).toBeInTheDocument();
    expect(screen.getByText("任务中心")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.queryByText("成员与权限")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /运营驾驶舱/ })
    ).toHaveAttribute("aria-current", "page");
  });

  it("shows automation and management navigation to administrators", () => {
    render(
      <AppSidebar
        member={member("ADMIN")}
        unreadTasks={0}
        unreadMail={0}
      />
    );

    expect(screen.getByText("分组规则")).toBeInTheDocument();
    expect(screen.getByText("成员与权限")).toBeInTheDocument();
    expect(screen.getByText("系统设置")).toBeInTheDocument();
  });
});
