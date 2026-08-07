import type {
  RedactedNotification
} from "@/modules/notifications/types";

type NotificationSource = {
  taskId: string;
  externalUserId: string;
  email: string;
  registrationIp: string | null;
  countryCode: string | null;
  region: string | null;
  segment: string;
  reason: string;
  priority: "URGENT" | "IMPORTANT" | "NORMAL";
  dueAt: Date;
  now: Date;
  appUrl: string;
};

const priorityLabels = {
  URGENT: "紧急",
  IMPORTANT: "重要",
  NORMAL: "普通"
} as const;

export function redactForNotification(
  source: NotificationSource
): RedactedNotification {
  const location =
    source.region || source.countryCode || "地区未知";
  const minutes = Math.max(
    0,
    Math.ceil(
      (source.dueAt.getTime() - source.now.getTime()) / 60_000
    )
  );
  const appUrl = source.appUrl.replace(/\/+$/, "");
  return {
    title: `[${priorityLabels[source.priority]}] ${source.reason}`,
    summary: [
      `用户：${source.externalUserId}（${location}，${source.segment} 组）`,
      `原因：${source.reason}`,
      `时限：剩余 ${minutes} 分钟`
    ].join("\n"),
    taskUrl: `${appUrl}/users?query=${encodeURIComponent(source.externalUserId)}`
  };
}
