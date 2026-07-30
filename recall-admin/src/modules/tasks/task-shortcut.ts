import type { TaskOrigin } from "@/generated/prisma/client";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";
import type { TaskFilters } from "@/modules/tasks/task-queries";

type ShortcutParams = {
  due?: string;
  origin?: string;
  scope?: string;
};

type ShortcutFilters = Pick<
  TaskFilters,
  "statuses" | "origins" | "dueFrom" | "dueBefore"
> & {
  label?: string;
};

const taskOrigins: TaskOrigin[] = [
  "AUTOMATION",
  "MANUAL",
  "EMAIL_REPLY"
];

function shanghaiDayRange(now: Date): {
  start: Date;
  end: Date;
} {
  const offset = 8 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offset);
  const start = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate()
    ) - offset
  );
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000)
  };
}

export function taskShortcutFilters(
  params: ShortcutParams,
  now: Date
): ShortcutFilters {
  const origin = taskOrigins.includes(params.origin as TaskOrigin)
    ? (params.origin as TaskOrigin)
    : null;
  if (params.due === "today") {
    const range = shanghaiDayRange(now);
    return {
      statuses: [...openTaskStatuses],
      dueFrom: range.start,
      dueBefore: range.end,
      label: "今天到期且尚未完成的任务"
    };
  }
  if (params.scope === "open") {
    return {
      statuses: [...openTaskStatuses],
      ...(origin ? { origins: [origin] } : {}),
      label:
        origin === "EMAIL_REPLY"
          ? "用户来信生成且尚未完成的任务"
          : "尚未完成的任务"
    };
  }
  return origin
    ? {
        origins: [origin],
        label:
          origin === "EMAIL_REPLY"
            ? "用户来信生成的任务"
            : "指定来源的任务"
      }
    : {};
}
