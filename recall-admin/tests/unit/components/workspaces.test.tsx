// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskActions } from "@/components/tasks/task-actions";
import { TaskTable } from "@/components/tables/task-table";
import { UserTable } from "@/components/tables/user-table";
import type { TaskListItem } from "@/modules/tasks/task-queries";
import type { UserListItem } from "@/modules/users/user-queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn()
  })
}));

const user = {
  id: "user-1",
  externalUserId: "rt-user-1",
  email: "complete-email@example.test",
  displayName: "Test User",
  registeredAt: new Date("2026-07-20T08:00:00.000Z"),
  countryCode: "US",
  region: "California",
  source: "righttoken-web",
  paymentStatus: "NONE",
  totalPaidMinor: 0,
  lastCallAt: null,
  successfulCallCount: 0,
  balanceMinor: 0,
  currentSegment: "B",
  reasonLabel: "checkout unpaid",
  ownerId: "operator-1",
  lastExternalEventAt: new Date("2026-07-23T08:00:00.000Z"),
  updatedAt: new Date("2026-07-23T08:00:00.000Z"),
  owner: {
    id: "operator-1",
    displayName: "Operator One"
  },
  tasks: [
    {
      id: "task-1",
      title: "支付未完成",
      priority: "IMPORTANT",
      status: "TODO",
      dueAt: new Date("2026-07-24T08:00:00.000Z")
    }
  ]
} satisfies UserListItem;

const task = {
  id: "task-1",
  title: "支付未完成",
  reason: "进入支付流程后未完成首单",
  origin: "AUTOMATION",
  priority: "IMPORTANT",
  status: "TODO",
  assigneeId: "operator-1",
  assignmentReason: "美国 B 组",
  dueAt: new Date("2026-07-24T08:00:00.000Z"),
  createdAt: new Date("2026-07-23T08:00:00.000Z"),
  updatedAt: new Date("2026-07-23T08:00:00.000Z"),
  user: {
    id: "user-1",
    externalUserId: "rt-user-1",
    email: "complete-email@example.test",
    displayName: "Test User",
    currentSegment: "B",
    countryCode: "US",
    region: "California"
  },
  assignee: {
    id: "operator-1",
    displayName: "Operator One"
  }
} satisfies TaskListItem;

describe("user and task workspaces", () => {
  afterEach(cleanup);

  it("shows the complete email in the user list without rendering an IP", () => {
    render(<UserTable users={[user]} />);

    expect(
      screen.getByText("complete-email@example.test")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /rt-user-1/i })
    ).toHaveAttribute("href", "/users/user-1");
    expect(screen.queryByText(/203\.0\.113/)).not.toBeInTheDocument();
  });

  it("derives available buttons from an in-progress task", () => {
    render(
      <TaskActions
        task={{
          id: "task-1",
          status: "IN_PROGRESS",
          assigneeId: "operator-1"
        }}
        viewer={{ id: "operator-1", role: "OPERATOR" }}
        operators={[]}
      />
    );

    expect(
      screen.getByRole("button", { name: "等待用户" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "完成任务" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "暂停" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "领取任务" })
    ).not.toBeInTheDocument();
  });

  it("links a task row to both task detail and user context", () => {
    render(<TaskTable tasks={[task]} now={new Date("2026-07-24T07:00:00Z")} />);

    expect(
      screen.getByRole("link", { name: "支付未完成" })
    ).toHaveAttribute("href", "/tasks/task-1");
    expect(
      screen.getByRole("link", { name: /rt-user-1/i })
    ).toHaveAttribute("href", "/users/user-1");
    expect(
      screen.getByText("complete-email@example.test")
    ).toBeInTheDocument();
  });

  it("offers only claim for an unassigned public task to an operator", () => {
    render(
      <TaskActions
        task={{
          id: "task-public",
          status: "UNASSIGNED",
          assigneeId: null
        }}
        viewer={{ id: "operator-1", role: "OPERATOR" }}
        operators={[]}
      />
    );

    expect(
      screen.getByRole("button", { name: "领取任务" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "取消任务" })
    ).not.toBeInTheDocument();
  });
});
