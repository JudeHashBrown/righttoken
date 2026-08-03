import type { Prisma } from "@/generated/prisma/client";

export const configuredMailboxWhere = {
  encryptedConfig: { not: null },
  configurationDeletedAt: null
} satisfies Prisma.MailboxWhereInput;

export function isConfiguredMailbox(mailbox: {
  encryptedConfig: string | null;
  configurationDeletedAt: Date | null;
}): boolean {
  return (
    mailbox.encryptedConfig !== null &&
    mailbox.configurationDeletedAt === null
  );
}
