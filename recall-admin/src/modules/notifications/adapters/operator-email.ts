import type { SmtpImapConfig } from "@/modules/mail/adapters/smtp-imap";
import { sendSmtpMessage } from "@/modules/integrations/email/smtp-sender";
import type { NotificationAdapter } from "@/modules/notifications/types";

export function createOperatorEmailAdapter(
  config: SmtpImapConfig
): NotificationAdapter {
  return {
    channel: "EMAIL",
    async send(input) {
      const result = await sendSmtpMessage(config, {
        to: [input.recipient],
        subject: input.title,
        text: `${input.summary}\n\n打开任务：${input.taskUrl}`
      });
      return { providerMessageId: result.providerMessageId };
    }
  };
}
