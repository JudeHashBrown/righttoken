import { prisma } from "@/lib/db/prisma";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";
import { getMailboxRuntimeConfig } from "@/modules/mail/mailbox-credentials";
import { createOperatorEmailAdapter } from "@/modules/notifications/adapters/operator-email";
import {
  createWecomAppAdapter,
  wecomAppConfigSchema
} from "@/modules/notifications/adapters/wecom-app";
import {
  createWecomWebhookAdapter,
  wecomWebhookConfigSchema
} from "@/modules/notifications/adapters/wecom-webhook";
import { sendNotificationIntent } from "@/modules/notifications/notification-service";
import { createDeadLetterEscalationIntents } from "@/modules/notifications/dead-letter-escalation";
import type {
  NotificationAdapter,
  NotificationChannel
} from "@/modules/notifications/types";

export async function handleNotificationDelivery(
  now = new Date()
) {
  const [wecomAppConfig, wecomRobotConfig, mailbox] =
    await Promise.all([
    getIntegrationCredential("WECOM_APP"),
    getIntegrationCredential("WECOM_ROBOT"),
    prisma.mailbox.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    })
    ]);
  const adapters: Partial<
    Record<NotificationChannel, NotificationAdapter>
  > = {};
  const parsedWecomApp =
    wecomAppConfigSchema.safeParse(wecomAppConfig);
  if (parsedWecomApp.success) {
    adapters.WECOM_APP = createWecomAppAdapter(
      parsedWecomApp.data
    );
  }
  const parsedWecom =
    wecomWebhookConfigSchema.safeParse(wecomRobotConfig);
  if (parsedWecom.success) {
    adapters.WECOM_ROBOT = createWecomWebhookAdapter(
      parsedWecom.data
    );
  }
  if (mailbox) {
    adapters.EMAIL = createOperatorEmailAdapter(
      await getMailboxRuntimeConfig(mailbox.id)
    );
  }
  const intents = await prisma.notificationIntent.findMany({
    where: {
      channel: {
        in: ["WECOM_APP", "WECOM_ROBOT", "EMAIL"]
      },
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
    } else if (result.status === "DEAD_LETTER") {
      await createDeadLetterEscalationIntents(
        intent.id,
        now
      );
    }
  }
  return {
    pending: intents.length,
    attempted,
    sent
  };
}
