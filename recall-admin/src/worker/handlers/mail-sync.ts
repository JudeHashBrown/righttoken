import { prisma } from "@/lib/db/prisma";
import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import { getMailboxRuntimeConfig } from "@/modules/mail/mailbox-credentials";
import {
  classifyMailSyncError,
  mailSyncErrorDiagnostic
} from "@/modules/mail/sync-error";
import { syncMailbox } from "@/modules/mail/sync-mailbox";
import type { MailboxAdapter } from "@/modules/mail/types";

type AdapterFactory = (
  mailboxId: string
) => Promise<MailboxAdapter>;

async function runtimeAdapter(
  mailboxId: string
): Promise<MailboxAdapter> {
  return createSmtpImapAdapter(
    await getMailboxRuntimeConfig(mailboxId)
  );
}

export async function handleMailSync(
  now = new Date(),
  adapterFactory: AdapterFactory = runtimeAdapter,
  options: { mailboxIds?: string[] } = {}
) {
  const mailboxes = await prisma.mailbox.findMany({
    where: {
      enabled: true,
      ...(options.mailboxIds
        ? { id: { in: options.mailboxIds } }
        : {})
    },
    select: { id: true }
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
        await adapterFactory(mailbox.id),
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
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { lastErrorCode: code }
      });
    }
  }
  return summary;
}
