import { z } from "zod";
import type { NotificationAdapter } from "@/modules/notifications/types";

export const wecomWebhookConfigSchema = z
  .object({
    webhookUrl: z.string().url()
  })
  .strict();

export type WecomWebhookConfig = z.infer<
  typeof wecomWebhookConfigSchema
>;

export class NotificationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean
  ) {
    super(code);
    this.name = "NotificationDeliveryError";
  }
}

export function createWecomWebhookAdapter(
  rawConfig: WecomWebhookConfig,
  fetchImpl: typeof fetch = fetch
): NotificationAdapter {
  const config = wecomWebhookConfigSchema.parse(rawConfig);
  return {
    channel: "WECOM_ROBOT",
    async send(input) {
      let response: Response;
      try {
        response = await fetchImpl(config.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            msgtype: "markdown",
            markdown: {
              content: [
                `### ${input.title}`,
                input.summary,
                `[查看用户](${input.taskUrl})`
              ].join("\n")
            }
          }),
          signal: AbortSignal.timeout(5_000)
        });
      } catch {
        throw new NotificationDeliveryError(
          "WECOM_NETWORK_ERROR",
          true
        );
      }
      if (response.status === 429 || response.status >= 500) {
        throw new NotificationDeliveryError(
          "WECOM_RETRYABLE",
          true
        );
      }
      if (!response.ok) {
        throw new NotificationDeliveryError(
          "WECOM_REJECTED",
          false
        );
      }
      const result = (await response.json().catch(() => null)) as {
        errcode?: number;
      } | null;
      if (result?.errcode !== 0) {
        throw new NotificationDeliveryError(
          "WECOM_PROVIDER_ERROR",
          false
        );
      }
      return {};
    }
  };
}
