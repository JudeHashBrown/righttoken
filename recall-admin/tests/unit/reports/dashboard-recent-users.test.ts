import { describe, expect, it } from "vitest";
import {
  dashboardFocusOrDefault,
  effectiveAnomalyAt,
  limitDashboardFocusUsers,
  parseDashboardFocus,
  recentAnomalyWhere,
  recentAnomalyOrderBy,
  recentUnpaidWhere,
  recentUserCutoff
} from "@/modules/reports/dashboard-recent-users";

const now = new Date("2026-08-06T12:00:00.000Z");

describe("dashboard recent user filters", () => {
  it("accepts only supported focus values", () => {
    expect(parseDashboardFocus("recent-unpaid")).toBe("recent-unpaid");
    expect(parseDashboardFocus("recent-anomaly")).toBe("recent-anomaly");
    expect(parseDashboardFocus("anything-else")).toBeNull();
    expect(parseDashboardFocus(undefined)).toBeNull();
  });

  it("defaults the dashboard to recent service anomalies", () => {
    expect(dashboardFocusOrDefault(undefined)).toBe("recent-anomaly");
    expect(dashboardFocusOrDefault("invalid")).toBe("recent-anomaly");
    expect(dashboardFocusOrDefault("recent-unpaid")).toBe("recent-unpaid");
  });

  it("uses an inclusive cutoff exactly 72 hours before now", () => {
    expect(recentUserCutoff(now)).toEqual(
      new Date("2026-08-03T12:00:00.000Z")
    );
  });

  it("builds the administrator unpaid-registration filter", () => {
    expect(
      recentUnpaidWhere({ id: "admin-1", role: "ADMIN" }, now)
    ).toEqual({
      sourceDeletedAt: null,
      currentSegment: "A",
      registeredAt: { gte: new Date("2026-08-03T12:00:00.000Z") }
    });
  });

  it("limits operator results to owned or unassigned users", () => {
    expect(
      recentUnpaidWhere({ id: "operator-1", role: "OPERATOR" }, now)
    ).toEqual({
      OR: [{ ownerId: "operator-1" }, { ownerId: null }],
      sourceDeletedAt: null,
      currentSegment: "A",
      registeredAt: { gte: new Date("2026-08-03T12:00:00.000Z") }
    });
  });

  it("builds the active service-anomaly filter from either anomaly timestamp", () => {
    expect(
      recentAnomalyWhere({ id: "admin-1", role: "ADMIN" }, now)
    ).toEqual({
      sourceDeletedAt: null,
      currentSegment: "F",
      anomalyActive: true,
      OR: [
        {
          anomalyLastOccurredAt: {
            gte: new Date("2026-08-03T12:00:00.000Z")
          }
        },
        {
          anomalyChangedAt: {
            gte: new Date("2026-08-03T12:00:00.000Z")
          }
        }
      ]
    });
  });

  it("combines operator ownership with the anomaly timestamp alternatives", () => {
    expect(
      recentAnomalyWhere({ id: "operator-1", role: "OPERATOR" }, now)
    ).toMatchObject({
      sourceDeletedAt: null,
      currentSegment: "F",
      anomalyActive: true,
      AND: [
        { OR: [{ ownerId: "operator-1" }, { ownerId: null }] },
        {
          OR: [
            {
              anomalyLastOccurredAt: {
                gte: new Date("2026-08-03T12:00:00.000Z")
              }
            },
            {
              anomalyChangedAt: {
                gte: new Date("2026-08-03T12:00:00.000Z")
              }
            }
          ]
        }
      ]
    });
  });

  it("uses the later available anomaly timestamp", () => {
    expect(
      effectiveAnomalyAt({
        anomalyLastOccurredAt: new Date("2026-08-06T08:00:00.000Z"),
        anomalyChangedAt: new Date("2026-08-06T09:00:00.000Z")
      })
    ).toEqual(new Date("2026-08-06T09:00:00.000Z"));

    expect(
      effectiveAnomalyAt({
        anomalyLastOccurredAt: null,
        anomalyChangedAt: new Date("2026-08-06T07:00:00.000Z")
      })
    ).toEqual(new Date("2026-08-06T07:00:00.000Z"));
  });

  it("keeps only the newest 100 focused users", () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: `user-${String(index).padStart(3, "0")}`,
      registeredAt: new Date(now.getTime() - index * 1_000),
      anomalyAt: new Date(now.getTime() - index * 2_000)
    }));

    const page = limitDashboardFocusUsers(rows.reverse(), "recent-anomaly");

    expect(page).toHaveLength(100);
    expect(page[0]?.id).toBe("user-000");
    expect(page.at(-1)?.id).toBe("user-099");
  });

  it("sorts nullable anomaly timestamps with missing values last", () => {
    expect(recentAnomalyOrderBy("anomalyLastOccurredAt")).toEqual([
      {
        anomalyLastOccurredAt: { sort: "desc", nulls: "last" }
      },
      { id: "desc" }
    ]);
    expect(recentAnomalyOrderBy("anomalyChangedAt")).toEqual([
      {
        anomalyChangedAt: { sort: "desc", nulls: "last" }
      },
      { id: "desc" }
    ]);
  });
});
