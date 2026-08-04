import { prisma } from "@/lib/db/prisma";
import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import {
  getMailboxRuntimeConfiguration
} from "@/modules/mail/mailbox-credentials";
import {
  classifyMailSyncError,
  mailSyncErrorDiagnostic
} from "@/modules/mail/sync-error";
import { syncMailbox } from "@/modules/mail/sync-mailbox";
import type { MailboxAdapter } from "@/modules/mail/types";
import {
  configuredMailboxWhere
} from "@/modules/mail/mailbox-availability";

type AdapterFactory = (
  mailboxId: string,
  configurationVersion: number
) => Promise<MailboxAdapter>;

async function runtimeAdapter(
  mailboxId: string,
  configurationVersion: number
): Promise<MailboxAdapter> {
  const runtime = await getMailboxRuntimeConfiguration(
    mailboxId,
    configurationVersion
  );
  return createSmtpImapAdapter(runtime.config);
}

export async function handleMailSync(
  now = new Date(),
  adapterFactory: AdapterFactory = runtimeAdapter,
  options: { mailboxIds?: string[] } = {}
) {
  const mailboxes = await prisma.mailbox.findMany({
    where: {
      ...configuredMailboxWhere,
      enabled: true,
      ...(options.mailboxIds
        ? { id: { in: options.mailboxIds } }
        : {})
    },
    select: { id: true, configurationVersion: true }
  });
  const summary = {
    mailboxes: mailboxes.length,
    failed: 0,
    received: 0,
    matched: 0,
    unmatched: 0,
    replyTasksCreated: 0,
    replyTasksReopened: 0
  };
  for (const mailbox of mailboxes) {
    try {
      const result = await syncMailbox(
        mailbox.id,
        await adapterFactory(
          mailbox.id,
          mailbox.configurationVersion
        ),
        mailbox.configurationVersion,
        now
      );
      summary.received += result.received;
      summary.matched += result.matched;
      summary.unmatched += result.unmatched;
      summary.replyTasksCreated += result.replyTasksCreated;
      summary.replyTasksReopened += result.replyTasksReopened;
    } catch (error) {
      const code = classifyMailSyncError(error);
      const diagnostic = mailSyncErrorDiagnostic(error);
      summary.failed += 1;
      console.error("mail_sync_failed", {
        mailboxId: mailbox.id,
        stage: "scheduled_sync",
        code,
        ...diagnostic
      });
      await prisma.mailbox.updateMany({
        where: {
          id: mailbox.id,
          configurationVersion: mailbox.configurationVersion,
          encryptedConfig: { not: null },
          configurationDeletedAt: null,
          enabled: true
        },
        data: { lastErrorCode: code }
      });
    }
  }
  return summary;
}
