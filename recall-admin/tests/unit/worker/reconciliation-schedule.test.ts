import { describe, expect, it } from "vitest";
import { reconciliationSchedules } from "@/worker/reconciliation-schedule";

describe("reconciliationSchedules", () => {
  it("does not schedule real-data synchronization when disabled", () => {
    expect(
      reconciliationSchedules({
        enabled: false,
        intervalMinutes: 15,
        fullCron: "0 2 * * *"
      })
    ).toEqual([]);
  });

  it("schedules 15-minute incremental and 2am Shanghai full reconciliation", () => {
    expect(
      reconciliationSchedules({
        enabled: true,
        intervalMinutes: 15,
        fullCron: "0 2 * * *"
      })
    ).toEqual([
      {
        cron: "*/15 * * * *",
        data: { mode: "incremental" },
        key: "righttoken-incremental-15-minutes",
        timezone: "Asia/Shanghai"
      },
      {
        cron: "0 2 * * *",
        data: { mode: "full" },
        key: "righttoken-full-daily",
        timezone: "Asia/Shanghai"
      }
    ]);
  });
});
