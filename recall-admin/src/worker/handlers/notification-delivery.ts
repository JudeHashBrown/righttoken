import { prisma } from "@/lib/db/prisma";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";
import { getMailboxRuntimeConfig } from "@/modules/mail/mailbox-credentials";
import { createOperatorEmailAdapter } from "@/modules/notifications/adapters/operator-email";
import {
  createWecomWebhookAdapter,
  wecomWebhookConfigSchema
} from "@/modules/notifications/adapters/wecom-webhook";
import { sendNotificationIntent } from "@/modules/notifications/notification-service";
import type { NotificationAdapter } from "@/modules/notifications/types";

export async function handleNotificationDelivery(
  now = new Date()
) {
  const [wecomConfig, mailbox] = await Promise.all([
    getIntegrationCredential("WECOM_ROBOT"),
    prisma.mailbox.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    })
  ]);
  const adapters: Partial<
    Record<"WECOM" | "EMAIL", NotificationAdapter>
  > = {};
  const parsedWecom = wecomWebhookConfigSchema.safeParse(wecomConfig);
  if (parsedWecom.success) {
    adapters.WECOM = createWecomWebhookAdapter(parsedWecom.data);
  }
  if (mailbox) {
    adapters.EMAIL = createOperatorEmailAdapter(
      await getMailboxRuntimeConfig(mailbox.id)
    );
  }
  const intents = await prisma.notificationIntent.findMany({
    where: {
      channel: { in: ["WECOM", "EMAIL"] },
      status: { in: ["PENDING", "FAILED"] },
      OR: [
        { nextAttemptAt: null },
        { nextAttemptAt: { lte: now } }
      ]
    },
    orderBy: { createdAt: "asc" },
    take: 100
  });
  let sent = 0;
  let attempted = 0;
  for (const intent of intents) {
    if (intent.channel === "IN_APP") {
      continue;
    }
    const adapter = adapters[intent.channel];
    if (!adapter) {
      continue;
    }
    attempted += 1;
    const result = await sendNotificationIntent(
      intent.id,
      { [intent.channel]: adapter },
      now
    );
    if (result.status === "SENT") {
      sent += 1;
    }
  }
  return {
    pending: intents.length,
    attempted,
    sent
  };
}
