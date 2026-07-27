import { z } from "zod";
import type {
  NotificationAdapter,
  RedactedNotification
} from "@/modules/notifications/types";

const WECOM_API_BASE_URL = "https://qyapi.weixin.qq.com";
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const TOKEN_ERROR_CODES = new Set([40001, 40014, 42001]);

export const wecomAppConfigSchema = z
  .object({
    corpId: z.string().trim().min(1),
    agentId: z.string().trim().regex(/^\d+$/),
    secret: z.string().trim().min(1)
  })
  .strict();

export type WecomAppConfig = z.infer<
  typeof wecomAppConfigSchema
>;

export class WecomDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean
  ) {
    super(code);
    this.name = "WecomDeliveryError";
  }
}

type WecomResponse = {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
  msgid?: string;
};

async function requestJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch
): Promise<WecomResponse> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    throw new WecomDeliveryError(
      "WECOM_NETWORK_ERROR",
      true
    );
  }
  if (response.status === 429 || response.status >= 500) {
    throw new WecomDeliveryError("WECOM_RETRYABLE", true);
  }
  if (!response.ok) {
    throw new WecomDeliveryError("WECOM_REJECTED", false);
  }
  return (await response.json().catch(() => null)) as
    | WecomResponse
    | null ?? {};
}

function providerError(result: WecomResponse): WecomDeliveryError {
  if (
    result.errcode === 40013 ||
    result.errcode === 40093
  ) {
    return new WecomDeliveryError(
      "WECOM_AUTH_INVALID",
      false
    );
  }
  if (
    result.errcode === 60111 ||
    result.errcode === 81013
  ) {
    return new WecomDeliveryError(
      "WECOM_RECIPIENT_INVALID",
      false
    );
  }
  return new WecomDeliveryError(
    "WECOM_PROVIDER_ERROR",
    false
  );
}

function messageBody(
  config: WecomAppConfig,
  input: RedactedNotification & { recipient: string }
) {
  return {
    touser: input.recipient,
    msgtype: "textcard",
    agentid: Number(config.agentId),
    textcard: {
      title: input.title,
      description: input.summary,
      url: input.taskUrl,
      btntxt: "查看任务"
    },
    enable_id_trans: 0,
    enable_duplicate_check: 1,
    duplicate_check_interval: 1800
  };
}

export function createWecomAppAdapter(
  rawConfig: WecomAppConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): NotificationAdapter {
  const config = wecomAppConfigSchema.parse(rawConfig);
  let token: { value: string; expiresAtMs: number } | null = null;

  async function accessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      token &&
      token.expiresAtMs > now()
    ) {
      return token.value;
    }
    const url = new URL("/cgi-bin/gettoken", WECOM_API_BASE_URL);
    url.searchParams.set("corpid", config.corpId);
    url.searchParams.set("corpsecret", config.secret);
    const result = await requestJson(
      url.toString(),
      {},
      fetchImpl
    );
    if (
      result.errcode !== 0 ||
      !result.access_token ||
      !result.expires_in
    ) {
      throw providerError(result);
    }
    token = {
      value: result.access_token,
      expiresAtMs:
        now() +
        Math.max(
          0,
          result.expires_in * 1_000 - TOKEN_REFRESH_MARGIN_MS
        )
    };
    return token.value;
  }

  async function sendWithToken(
    input: RedactedNotification & { recipient: string },
    forceRefresh = false
  ): Promise<WecomResponse> {
    const currentToken = await accessToken(forceRefresh);
    const result = await requestJson(
      `${WECOM_API_BASE_URL}/cgi-bin/message/send?access_token=` +
        encodeURIComponent(currentToken),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(messageBody(config, input))
      },
      fetchImpl
    );
    if (
      result.errcode !== undefined &&
      result.errcode !== 0
    ) {
      if (!forceRefresh && TOKEN_ERROR_CODES.has(result.errcode)) {
        token = null;
        return sendWithToken(input, true);
      }
      throw providerError(result);
    }
    return result;
  }

  return {
    channel: "WECOM_APP",
    async send(input) {
      const result = await sendWithToken(input);
      return {
        ...(result.msgid
          ? { providerMessageId: result.msgid }
          : {})
      };
    }
  };
}
