// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserTable } from "@/components/tables/user-table";
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
  locationAssignmentMode: "AUTO",
  source: "righttoken-web",
  paymentStatus: "NONE",
  totalPaidMinor: 0,
  lastCallAt: null,
  successfulCallCount: 0,
  balanceMinor: 0,
  currentSegment: "B",
  reasonLabel: "checkout unpaid",
  anomalyActive: false,
  anomalyErrorPhase: null,
  anomalyErrorType: null,
  anomalyErrorMessage: null,
  anomalyErrorOwner: null,
  anomalyStatusCode: null,
  anomalyModel: null,
  anomalyPlatform: null,
  anomalyRequestCount: null,
  anomalyFailureCount: null,
  anomalyConsecutiveFailures: null,
  anomalyLastOccurredAt: null,
  ownerId: "operator-1",
  ownerAssignmentMode: "AUTO",
  ownerAssignedAt: new Date("2026-07-23T08:00:00.000Z"),
  ownerAssignmentReason: "美国用户由运营一负责",
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

describe("user workspace", () => {
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

  it("offers region and owner filters in the user table headers", () => {
    render(
      <form>
        <UserTable
          users={[user]}
          headerFilters={{
            region: "California",
            regions: ["California", "广东"],
            ownerId: "operator-1",
            owners: [
              {
                id: "operator-1",
                displayName: "Operator One"
              }
            ]
          }}
        />
      </form>
    );

    expect(
      screen.getByRole("combobox", { name: "筛选地区" })
    ).toHaveValue("California");
    expect(
      screen.getByRole("option", { name: "全部地区" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "筛选负责人" })
    ).toHaveValue("operator-1");
    expect(
      screen.getByRole("option", { name: "未分配" })
    ).toHaveValue("__UNASSIGNED__");
  });

  it("offers administrators an immediate action for an unassigned user", () => {
    render(
      <UserTable
        canManageOwners
        members={[
          { id: "operator-1", displayName: "Operator One" }
        ]}
        users={[
          {
            ...user,
            ownerId: null,
            owner: null,
            ownerAssignedAt: null,
            ownerAssignmentReason: "没有规则命中；进入公共池"
          }
        ]}
      />
    );

    expect(screen.getByText("未分配")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "立即分配" })
    ).toBeInTheDocument();
  });

  it("shows the concrete current anomaly beneath an F segment", () => {
    render(
      <UserTable
        users={[
          {
            ...user,
            currentSegment: "F",
            anomalyActive: true,
            anomalyErrorPhase: "upstream",
            anomalyErrorType: "provider_error",
            anomalyErrorOwner: "provider",
            anomalyStatusCode: 502,
            anomalyModel: "gpt-5",
            anomalyPlatform: "openai",
            anomalyRequestCount: 5,
            anomalyFailureCount: 4,
            anomalyConsecutiveFailures: 3,
            anomalyLastOccurredAt: new Date(
              "2026-07-23T09:54:00.000Z"
            )
          } as UserListItem
        ]}
      />
    );

    expect(
      screen.getByText("上游服务异常 · HTTP 502")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/近30分钟失败 4\/5/)
    ).toBeInTheDocument();
  });

});
