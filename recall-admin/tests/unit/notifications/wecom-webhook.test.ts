import { describe, expect, it, vi } from "vitest";
import {
  createWecomWebhookAdapter,
  NotificationDeliveryError
} from "@/modules/notifications/adapters/wecom-webhook";

describe("WeCom webhook adapter", () => {
  it("posts redacted markdown with a task link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const adapter = createWecomWebhookAdapter(
      {
        webhookUrl:
          "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"
      },
      fetchMock
    );

    await adapter.send({
      recipient: "integration:wecom-robot",
      title: "[紧急] 服务异常待处理",
      summary:
        "用户：RT-1908（上海，F 组）\n原因：连续调用失败\n时限：剩余 7 分钟",
      taskUrl: "https://recall.righttoken.ai/tasks/task-1"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("qyapi.weixin.qq.com"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "[打开任务](https://recall.righttoken.ai/tasks/task-1)"
        )
      })
    );
  });

  it("classifies rate limits as retryable without returning provider text", async () => {
    const adapter = createWecomWebhookAdapter(
      {
        webhookUrl:
          "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"
      },
      vi.fn().mockResolvedValue(new Response("limited", { status: 429 }))
    );

    await expect(
      adapter.send({
        recipient: "integration:wecom-robot",
        title: "通知",
        summary: "脱敏摘要",
        taskUrl: "https://recall.righttoken.ai/tasks/task-1"
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<NotificationDeliveryError>>({
        code: "WECOM_RETRYABLE",
        retryable: true
      })
    );
  });
});
