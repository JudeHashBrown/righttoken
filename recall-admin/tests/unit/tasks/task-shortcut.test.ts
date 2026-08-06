import { describe, expect, it } from "vitest";
import { taskShortcutFilters } from "@/modules/tasks/task-shortcut";

describe("task dashboard shortcut filters", () => {
  const now = new Date("2026-07-23T02:00:00.000Z");

  it("maps today to the Shanghai calendar day and open tasks", () => {
    expect(
      taskShortcutFilters(
        { due: "today", recent: "168h" },
        now
      )
    ).toEqual({
      statuses: [
        "UNASSIGNED",
        "TODO",
        "IN_PROGRESS",
        "WAITING_USER",
        "PAUSED"
      ],
      dueFrom: new Date("2026-07-22T16:00:00.000Z"),
      dueBefore: new Date("2026-07-23T16:00:00.000Z"),
      createdFrom: new Date("2026-07-16T02:00:00.000Z"),
      label: "今天到期且尚未完成的任务"
    });
  });

  it("limits open shortcut results to the supported 72-hour window", () => {
    expect(
      taskShortcutFilters(
        {
          priority: "URGENT",
          scope: "open",
          recent: "72h"
        },
        now
      )
    ).toEqual({
      statuses: [
        "UNASSIGNED",
        "TODO",
        "IN_PROGRESS",
        "WAITING_USER",
        "PAUSED"
      ],
      createdFrom: new Date("2026-07-20T02:00:00.000Z"),
      label: "最近 72 小时创建且尚未完成的任务"
    });

    expect(
      taskShortcutFilters(
        {
          priority: "NORMAL",
          scope: "open",
          recent: "72h"
        },
        now
      )
    ).not.toHaveProperty("createdFrom");
  });

  it("maps open email-reply tasks without accepting unknown origins", () => {
    expect(
      taskShortcutFilters(
        { origin: "EMAIL_REPLY", scope: "open" },
        now
      )
    ).toEqual({
      statuses: [
        "UNASSIGNED",
        "TODO",
        "IN_PROGRESS",
        "WAITING_USER",
        "PAUSED"
      ],
      origins: ["EMAIL_REPLY"],
      label: "用户来信生成且尚未完成的任务"
    });
    expect(
      taskShortcutFilters(
        { origin: "UNKNOWN", scope: "open" },
        now
      )
    ).toEqual({
      statuses: [
        "UNASSIGNED",
        "TODO",
        "IN_PROGRESS",
        "WAITING_USER",
        "PAUSED"
      ],
      label: "尚未完成的任务"
    });
  });
});
