import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/authorization";
import {
  smtpImapConfigSchema,
  type SmtpImapConfig
} from "@/modules/mail/adapters/smtp-imap";
import {
  configuredMailboxWhere
} from "@/modules/mail/mailbox-availability";

type MailboxCredentialInput = {
  name: string;
  enabled: boolean;
  provider: "NAMECHEAP" | "WECOM_MAIL" | "CUSTOM";
  config: SmtpImapConfig;
};

function credentialCipher() {
  const rawKey = process.env.APP_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(Buffer.from(rawKey, "base64"));
}

export async function saveMailboxCredential(
  actorId: string,
  input: MailboxCredentialInput
) {
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("integrations:manage");
  }
  assertMemberPermission(actor, "integrations:manage");
  const config = smtpImapConfigSchema.parse(input.config);
  const name = input.name.trim();
  if (!name) {
    throw new Error("mailbox name is required");
  }
  const encryptedConfig = credentialCipher().encrypt(
    JSON.stringify({
      provider: input.provider,
      ...config
    })
  );

  const mailbox = await prisma.mailbox.upsert({
    where: { emailAddress: config.emailAddress },
    create: {
      name,
      emailAddress: config.emailAddress,
      encryptedConfig,
      enabled: input.enabled
    },
    update: {
      name,
      encryptedConfig,
      configurationDeletedAt: null,
      enabled: input.enabled,
      lastErrorCode: null
    },
    select: {
      id: true,
      name: true,
      emailAddress: true,
      enabled: true,
      lastTestedAt: true,
      lastSuccessAt: true,
      lastErrorCode: true
    }
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "mailbox.credential_saved",
      entityType: "Mailbox",
      entityId: mailbox.id,
      metadata: {
        provider: input.provider,
        emailDomain: config.emailAddress.split("@")[1] ?? "unknown",
        enabled: input.enabled
      }
    }
  });
  return mailbox;
}

export async function getMailboxRuntimeConfig(
  mailboxId: string
): Promise<SmtpImapConfig> {
  const mailbox = await prisma.mailbox.findFirstOrThrow({
    where: { id: mailboxId, ...configuredMailboxWhere },
    select: { encryptedConfig: true }
  });
  if (!mailbox.encryptedConfig) {
    throw new Error("MAILBOX_CONFIGURATION_REMOVED");
  }
  const decrypted = credentialCipher().decrypt(
    mailbox.encryptedConfig
  );
  const parsed = JSON.parse(decrypted) as Record<string, unknown>;
  const { provider: _provider, ...config } = parsed;
  void _provider;
  return smtpImapConfigSchema.parse(config);
}

export class MailboxConfigurationNotFoundError extends Error {
  constructor() {
    super("MAILBOX_CONFIGURATION_NOT_FOUND");
    this.name = "MailboxConfigurationNotFoundError";
  }
}

export async function removeMailboxConfiguration(
  actorId: string,
  mailboxId: string
): Promise<{ id: string }> {
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("integrations:manage");
  }
  assertMemberPermission(actor, "integrations:manage");

  return prisma.$transaction(async (tx) => {
    const mailbox = await tx.mailbox.findFirst({
      where: { id: mailboxId, ...configuredMailboxWhere },
      select: {
        id: true,
        emailAddress: true,
        enabled: true
      }
    });
    if (!mailbox) {
      throw new MailboxConfigurationNotFoundError();
    }

    const [threads, messages, batches] = await Promise.all([
      tx.mailThread.count({ where: { mailboxId } }),
      tx.mailMessage.count({ where: { mailboxId } }),
      tx.mailBatch.count({ where: { mailboxId } })
    ]);
    await tx.mailbox.update({
      where: { id: mailboxId },
      data: {
        encryptedConfig: null,
        configurationDeletedAt: new Date(),
        enabled: false,
        lastTestedAt: null,
        lastSuccessAt: null,
        lastErrorCode: null,
        lastSyncedAt: null
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "mailbox.configuration_deleted",
        entityType: "Mailbox",
        entityId: mailboxId,
        metadata: {
          emailDomain:
            mailbox.emailAddress.split("@")[1] ?? "unknown",
          previouslyEnabled: mailbox.enabled,
          preservedThreads: threads,
          preservedMessages: messages,
          preservedBatches: batches
        }
      }
    });
    return { id: mailboxId };
  });
}
