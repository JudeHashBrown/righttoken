import { describe, expect, it, vi } from "vitest";
import { createWecomAppAdapter } from "@/modules/notifications/adapters/wecom-app";
import { createWecomWebhookAdapter } from "@/modules/notifications/adapters/wecom-webhook";

function response(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("WeCom notification adapter contract", () => {
  it("delivers the same redacted task through app and group channels", async () => {
    const appFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          errcode: 0,
          access_token: "test-token",
          expires_in: 7200
        })
      )
      .mockResolvedValueOnce(
        response({ errcode: 0, msgid: "app-message" })
      );
    const robotFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ errcode: 0 }));
    const payload = {
      title: "[紧急] 服务异常",
      summary: "用户：RT-***123（US，F 组）\n时限：剩余 15 分钟",
      taskUrl: "https://recall.righttoken.ai/tasks/task-1"
    };

    await createWecomAppAdapter(
      {
        corpId: "ww-test",
        agentId: "1000002",
        secret: "test-secret"
      },
      appFetch
    ).send({
      recipient: "internal-member",
      ...payload
    });
    await createWecomWebhookAdapter(
      { webhookUrl: "https://example.test/wecom-webhook" },
      robotFetch
    ).send({
      recipient: "integration:wecom-robot",
      ...payload
    });

    const sentBodies = [
      String(appFetch.mock.calls[1]?.[1]?.body),
      String(robotFetch.mock.calls[0]?.[1]?.body)
    ];
    expect(sentBodies.join("\n")).not.toContain("@");
    expect(sentBodies.join("\n")).not.toMatch(
      /\b(?!127\.0\.0\.1)\d{1,3}(?:\.\d{1,3}){3}\b/
    );
    expect(sentBodies[0]).toContain("internal-member");
    expect(sentBodies[1]).toContain("打开任务");
  });
});
