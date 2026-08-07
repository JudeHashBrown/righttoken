import { describe, expect, it } from "vitest";
import { redactForNotification } from "@/modules/notifications/redact-notification";

describe("redactForNotification", () => {
  it("never places full email or IP into an external notification", () => {
    const payload = redactForNotification({
      taskId: "task-1",
      externalUserId: "RT-1908",
      email: "person@example.com",
      registrationIp: "203.0.113.42",
      countryCode: "CN",
      region: "上海",
      segment: "F",
      reason: "连续调用失败",
      priority: "URGENT",
      dueAt: new Date("2026-07-24T10:07:00.000Z"),
      now: new Date("2026-07-24T10:00:00.000Z"),
      appUrl: "https://recall.righttoken.ai"
    });

    expect(JSON.stringify(payload)).not.toContain("person@example.com");
    expect(JSON.stringify(payload)).not.toContain("203.0.113.42");
    expect(payload.summary).toContain("RT-1908");
    expect(payload.summary).toContain("上海");
    expect(payload.summary).toContain("F 组");
    expect(payload.taskUrl).toBe(
      "https://recall.righttoken.ai/users?query=RT-1908"
    );
  });
});
