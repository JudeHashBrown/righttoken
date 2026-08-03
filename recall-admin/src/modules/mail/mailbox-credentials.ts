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
  provider: "WECOM_MAIL" | "CUSTOM";
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
      configurationVersion: { increment: 1 },
      enabled: input.enabled,
      lastErrorCode: null
    },
    select: {
      id: true,
      name: true,
      emailAddress: true,
      enabled: true,
      configurationVersion: true,
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

export class MailboxConfigurationVersionConflictError extends Error {
  constructor() {
    super("MAILBOX_CONFIGURATION_VERSION_CONFLICT");
    this.name = "MailboxConfigurationVersionConflictError";
  }
}

export async function removeMailboxConfiguration(
  actorId: string,
  mailboxId: string,
  expectedConfigurationVersion: number
): Promise<{ id: string; configurationVersion: number }> {
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("integrations:manage");
  }
  assertMemberPermission(actor, "integrations:manage");

  return prisma.$transaction(async (tx) => {
    const [mailbox] = await tx.$queryRaw<
      Array<{
        id: string;
        emailAddress: string;
        encryptedConfig: string | null;
        configurationDeletedAt: Date | null;
        configurationVersion: number;
        enabled: boolean;
      }>
    >`
      SELECT
        "id",
        "emailAddress",
        "encryptedConfig",
        "configurationDeletedAt",
        "configurationVersion",
        "enabled"
      FROM "recall"."Mailbox"
      WHERE "id" = ${mailboxId}
      FOR UPDATE
    `;
    if (!mailbox) {
      throw new MailboxConfigurationNotFoundError();
    }
    if (
      mailbox.configurationVersion !==
      expectedConfigurationVersion
    ) {
      throw new MailboxConfigurationVersionConflictError();
    }
    if (
      mailbox.encryptedConfig === null ||
      mailbox.configurationDeletedAt !== null
    ) {
      throw new MailboxConfigurationNotFoundError();
    }

    const [threads, messages, batches] = await Promise.all([
      tx.mailThread.count({ where: { mailboxId } }),
      tx.mailMessage.count({ where: { mailboxId } }),
      tx.mailBatch.count({ where: { mailboxId } })
    ]);
    const cleared = await tx.mailbox.updateMany({
      where: {
        id: mailboxId,
        configurationVersion: expectedConfigurationVersion,
        encryptedConfig: { not: null },
        configurationDeletedAt: null
      },
      data: {
        encryptedConfig: null,
        configurationDeletedAt: new Date(),
        configurationVersion: { increment: 1 },
        enabled: false,
        lastTestedAt: null,
        lastSuccessAt: null,
        lastErrorCode: null,
        lastSyncedAt: null
      }
    });
    if (cleared.count !== 1) {
      throw new MailboxConfigurationVersionConflictError();
    }
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
    return {
      id: mailboxId,
      configurationVersion: expectedConfigurationVersion + 1
    };
  });
}
