import { prisma } from "@/lib/db/prisma";
import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import { getMailboxRuntimeConfig } from "@/modules/mail/mailbox-credentials";
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
  adapterFactory: AdapterFactory = runtimeAdapter
) {
  const mailboxes = await prisma.mailbox.findMany({
    where: { enabled: true },
    select: { id: true }
  });
  const summary = {
    mailboxes: mailboxes.length,
    failed: 0,
    received: 0,
    matched: 0,
    unmatched: 0,
    replyTasksCreated: 0
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
    } catch {
      summary.failed += 1;
      await prisma.mailbox.update({
        where: { id: mailbox.id },
        data: { lastErrorCode: "MAIL_SYNC_FAILED" }
      });
    }
  }
  return summary;
}
