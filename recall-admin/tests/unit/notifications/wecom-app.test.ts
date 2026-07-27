import { describe, expect, it, vi } from "vitest";
import {
  createWecomAppAdapter,
  WecomDeliveryError
} from "@/modules/notifications/adapters/wecom-app";

const config = {
  corpId: "ww-test-corp",
  agentId: "1000002",
  secret: "test-secret"
};

const message = {
  recipient: "zhangsan",
  title: "RightToken 重要任务",
  summary: "用户 RT-***123 · US · B 组 · 剩余 30 分钟",
  taskUrl: "http://127.0.0.1:3000/tasks/task-1"
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("WeCom app adapter", () => {
  it("gets an access token and sends a text card to one member", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          errcode: 0,
          access_token: "token-1",
          expires_in: 7200
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, msgid: "message-1" })
      );

    const adapter = createWecomAppAdapter(
      config,
      fetchImpl,
      () => 1_000
    );
    await expect(adapter.send(message)).resolves.toEqual({
      providerMessageId: "message-1"
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/cgi-bin/gettoken?"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    const sendRequest = fetchImpl.mock.calls[1]!;
    expect(sendRequest[0]).toContain(
      "/cgi-bin/message/send?access_token=token-1"
    );
    expect(sendRequest[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" }
    });
    const body = JSON.parse(String(sendRequest[1]?.body)) as {
      touser: string;
      agentid: number;
      msgtype: string;
      textcard: {
        title: string;
        description: string;
        url: string;
      };
    };
    expect(body).toMatchObject({
      touser: "zhangsan",
      agentid: 1_000_002,
      msgtype: "textcard",
      textcard: {
        title: message.title,
        description: message.summary,
        url: message.taskUrl
      }
    });
    expect(body.textcard.description).not.toContain("@");
    expect(body.textcard.description).not.toMatch(
      /\b\d{1,3}(?:\.\d{1,3}){3}\b/
    );
  });

  it("reuses a token until it is close to expiration", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          errcode: 0,
          access_token: "token-1",
          expires_in: 7200
        })
      )
      .mockResolvedValue(
        jsonResponse({ errcode: 0, msgid: "message" })
      );
    const adapter = createWecomAppAdapter(
      config,
      fetchImpl,
      () => 1_000
    );

    await adapter.send(message);
    await adapter.send({ ...message, recipient: "lisi" });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(
      fetchImpl.mock.calls.filter(([url]) =>
        String(url).includes("/cgi-bin/gettoken")
      )
    ).toHaveLength(1);
  });

  it("refreshes an expired provider token once", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          errcode: 0,
          access_token: "expired-token",
          expires_in: 7200
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 42001, errmsg: "token expired" })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          errcode: 0,
          access_token: "fresh-token",
          expires_in: 7200
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, msgid: "message-2" })
      );
    const adapter = createWecomAppAdapter(
      config,
      fetchImpl,
      () => 1_000
    );

    await expect(adapter.send(message)).resolves.toEqual({
      providerMessageId: "message-2"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("classifies network and provider throttling as retryable", async () => {
    const networkAdapter = createWecomAppAdapter(
      config,
      vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"))
    );
    await expect(networkAdapter.send(message)).rejects.toMatchObject({
      code: "WECOM_NETWORK_ERROR",
      retryable: true
    });

    const throttledAdapter = createWecomAppAdapter(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ errcode: 0 }, 429)
      )
    );
    await expect(throttledAdapter.send(message)).rejects.toMatchObject({
      code: "WECOM_RETRYABLE",
      retryable: true
    });
  });

  it("classifies invalid application credentials as non-retryable", async () => {
    const adapter = createWecomAppAdapter(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({ errcode: 40013, errmsg: "invalid corpid" })
      )
    );

    await expect(adapter.send(message)).rejects.toEqual(
      expect.objectContaining<Partial<WecomDeliveryError>>({
        code: "WECOM_AUTH_INVALID",
        retryable: false
      })
    );
  });
});
