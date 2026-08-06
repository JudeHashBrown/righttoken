// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import type { DashboardSnapshot } from "@/modules/reports/dashboard-query";

const snapshot: DashboardSnapshot = {
  metrics: {
    dueToday: 28,
    overdue: 6,
    urgent: 3,
    recentUnpaid: 9,
    recentAnomalies: 4,
    awaitingReply: 17,
    unassignedUsers: 12,
    sevenDayRecallRate: 18.6
  },
  focus: null,
  focusUsers: [],
  priorityTasks: [
    {
      id: "task-1",
      userId: "user-1",
      externalUserId: "RT-72841",
      userLabel: "赵女士",
      segment: "F",
      title: "服务异常需要介入",
      priority: "URGENT",
      status: "TODO",
      dueAt: new Date("2026-07-23T06:30:00.000Z"),
      assigneeName: "林小雨",
      region: "新加坡"
    }
  ],
  segmentDistribution: [
    { segment: "A", count: 84 },
    { segment: "B", count: 36 },
    { segment: "C", count: 29 },
    { segment: "D", count: 41 },
    { segment: "E", count: 22 },
    { segment: "F", count: 8 },
    { segment: "G", count: 140 }
  ],
  channelHealth: [
    {
      channel: "Namecheap 客服邮箱",
      state: "healthy",
      detail: "运行正常"
    },
    {
      channel: "企业微信邮箱",
      state: "warning",
      detail: "等待配置"
    },
    {
      channel: "企微群机器人",
      state: "healthy",
      detail: "运行正常"
    }
  ],
  teamWorkload: [
    {
      memberId: "member-1",
      name: "林小雨",
      openTasks: 16,
      capacityPercent: 64
    },
    {
      memberId: null,
      name: "公共任务池",
      openTasks: 9,
      capacityPercent: 36
    }
  ]
};

describe("DashboardOverview", () => {
  afterEach(cleanup);

  it("renders the operations cockpit without design-explanation content", () => {
    render(
      <DashboardOverview
        isAdministrator
        now={new Date("2026-07-23T02:00:00.000Z")}
        snapshot={snapshot}
      />
    );

    expect(screen.queryByText("用户运营概览")).not.toBeInTheDocument();
    expect(screen.queryByText(/主管理员。今天需要重点关注/)).not.toBeInTheDocument();
    expect(screen.queryByText("2026年7月23日星期四")).not.toBeInTheDocument();
    expect(screen.getByText("近72小时注册未支付")).toBeInTheDocument();
    expect(screen.getByText("近72小时服务异常")).toBeInTheDocument();
    expect(screen.getByText("用户待回复")).toBeInTheDocument();
    expect(screen.getByText("待分配用户")).toBeInTheDocument();
    expect(screen.getByText("7 日召回转化")).toBeInTheDocument();
    expect(screen.getByText("服务异常需要介入")).toBeInTheDocument();
    expect(screen.getByText("A–G 用户分组")).toBeInTheDocument();
    expect(screen.getByText("联系渠道")).toBeInTheDocument();
    expect(screen.getByText("团队工作量")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /近72小时注册未支付 9/ })
    ).toHaveAttribute(
      "href",
      "/dashboard?focus=recent-unpaid#focus-list"
    );
    expect(
      screen.getByRole("link", { name: /近72小时服务异常 4/ })
    ).toHaveAttribute(
      "href",
      "/dashboard?focus=recent-anomaly#focus-list"
    );
    expect(
      screen.getByRole("link", { name: /用户待回复 17/ })
    ).toHaveAttribute(
      "href",
      "/mail?view=pending"
    );
    expect(
      screen.getByRole("link", { name: /待分配用户 12/ })
    ).toHaveAttribute(
      "href",
      "/users?ownerId=__UNASSIGNED__"
    );
    expect(screen.queryByText(/A 方案展开/)).not.toBeInTheDocument();
    expect(screen.queryByText("用户中心", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("任务与邮件", { exact: true })).not.toBeInTheDocument();
  });

  it("shows recent unpaid users below the metric cards", () => {
    render(
      <DashboardOverview
        isAdministrator
        now={new Date("2026-08-06T12:00:00.000Z")}
        snapshot={{
          ...snapshot,
          focus: "recent-unpaid",
          focusUsers: [
            {
              id: "user-2",
              externalUserId: "RT-90001",
              displayName: "梅女士",
              email: "mei@example.com",
              region: "中国",
              ownerName: "王运营",
              registeredAt: new Date("2026-08-06T08:00:00.000Z"),
              anomalyReason: null,
              anomalyAt: null
            }
          ]
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "近72小时注册未支付用户" })
    ).toBeInTheDocument();
    expect(screen.getByText("梅女士")).toBeInTheDocument();
    expect(screen.getByText("mei@example.com")).toBeInTheDocument();
    expect(screen.getByText("中国")).toBeInTheDocument();
    expect(screen.getByText("王运营")).toBeInTheDocument();
    expect(screen.getByText("注册时间")).toBeInTheDocument();
  });

  it("shows recent service anomalies and their reason", () => {
    render(
      <DashboardOverview
        isAdministrator
        now={new Date("2026-08-06T12:00:00.000Z")}
        snapshot={{
          ...snapshot,
          focus: "recent-anomaly",
          focusUsers: [
            {
              id: "user-3",
              externalUserId: "RT-90002",
              displayName: null,
              email: "error@example.com",
              region: null,
              ownerName: null,
              registeredAt: new Date("2026-07-01T08:00:00.000Z"),
              anomalyReason: "模型服务超时",
              anomalyAt: new Date("2026-08-06T09:30:00.000Z")
            }
          ]
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "近72小时服务异常用户" })
    ).toBeInTheDocument();
    expect(screen.getByText("模型服务超时")).toBeInTheDocument();
    expect(screen.getByText("异常时间")).toBeInTheDocument();
    expect(screen.getByText("未分配")).toBeInTheDocument();
  });

  it("shows an empty state for a selected focus with no users", () => {
    render(
      <DashboardOverview
        isAdministrator
        now={new Date("2026-08-06T12:00:00.000Z")}
        snapshot={{ ...snapshot, focus: "recent-unpaid", focusUsers: [] }}
      />
    );

    expect(screen.getByText("近72小时内没有符合条件的用户")).toBeInTheDocument();
  });

  it("shows a useful empty task state", () => {
    render(
      <DashboardOverview
        isAdministrator
        now={new Date("2026-07-23T02:00:00.000Z")}
        snapshot={{ ...snapshot, priorityTasks: [] }}
      />
    );

    expect(screen.getByText("当前没有需要优先处理的任务")).toBeInTheDocument();
  });

  it("does not show the global unassigned queue to operators", () => {
    render(
      <DashboardOverview
        isAdministrator={false}
        now={new Date("2026-07-23T02:00:00.000Z")}
        snapshot={snapshot}
      />
    );

    expect(screen.queryByText("待分配用户")).not.toBeInTheDocument();
  });
});
