import { describe, expect, it } from "vitest";
import {
  dashboardTaskWindows
} from "@/modules/reports/dashboard-task-windows";

describe("dashboard task windows", () => {
  it("uses fixed creation-time cutoffs for due-today and urgent tasks", () => {
    const now = new Date("2026-08-06T08:30:00.000Z");

    expect(dashboardTaskWindows(now)).toEqual({
      dueTodayCreatedAfter: new Date(
        "2026-07-30T08:30:00.000Z"
      ),
      urgentCreatedAfter: new Date(
        "2026-08-03T08:30:00.000Z"
      )
    });
  });
});
