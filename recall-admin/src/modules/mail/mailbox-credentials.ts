import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import { assertMemberPermission, ForbiddenError } from "@/modules/auth/guards";
import {
  smtpImapConfigSchema,
  type SmtpImapConfig
} from "@/modules/mail/adapters/smtp-imap";

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
  const mailbox = await prisma.mailbox.findUniqueOrThrow({
    where: { id: mailboxId },
    select: { encryptedConfig: true }
  });
  const decrypted = credentialCipher().decrypt(
    mailbox.encryptedConfig
  );
  const parsed = JSON.parse(decrypted) as Record<string, unknown>;
  const { provider: _provider, ...config } = parsed;
  void _provider;
  return smtpImapConfigSchema.parse(config);
}
