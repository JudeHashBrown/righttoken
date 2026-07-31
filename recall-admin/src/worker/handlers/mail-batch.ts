import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import {
  getMailboxRuntimeConfig
} from "@/modules/mail/mailbox-credentials";
import {
  processMailBatch,
  type MailBatchDeliveryDependencies,
  type MailBatchJobInput
} from "@/modules/mail/process-mail-batch";
import { prisma } from "@/lib/db/prisma";
import type {
  TaskScheduler
} from "@/modules/tasks/scheduler";

export type {
  MailBatchDeliveryDependencies,
  MailBatchJobInput
};

export async function handleMailBatch(
  input: MailBatchJobInput,
  now: Date,
  scheduler: TaskScheduler,
  dependencies?: MailBatchDeliveryDependencies,
  batchSize = 25
) {
  let resolvedDependencies = dependencies;
  if (!resolvedDependencies) {
    const batch = await prisma.mailBatch.findUniqueOrThrow({
      where: { id: input.batchId },
      select: { mailboxId: true }
    });
    const config = await getMailboxRuntimeConfig(
      batch.mailboxId
    );
    resolvedDependencies = {
      adapter: createSmtpImapAdapter(config)
    };
  }
  return processMailBatch(
    input,
    now,
    scheduler,
    resolvedDependencies,
    batchSize
  );
}
