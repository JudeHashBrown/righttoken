import { createFieldCipher } from "@/lib/crypto/field-encryption";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertMemberPermission, ForbiddenError } from "@/modules/auth/guards";

type CredentialConfig = Record<string, unknown>;

function integrationCipher() {
  const rawKey = process.env.APP_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(Buffer.from(rawKey, "base64"));
}

export async function saveIntegrationCredential(
  actorId: string,
  input: {
    kind: string;
    displayName: string;
    enabled: boolean;
    config: CredentialConfig;
    metadata?: Prisma.InputJsonObject;
  }
) {
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, active: true }
  });
  if (!actor.active) {
    throw new ForbiddenError("integrations:manage");
  }
  assertMemberPermission(actor, "integrations:manage");
  const kind = input.kind.trim();
  const displayName = input.displayName.trim();
  if (
    !kind ||
    !displayName ||
    !input.config ||
    Array.isArray(input.config)
  ) {
    throw new Error("invalid integration credential");
  }
  const encryptedConfig = integrationCipher().encrypt(
    JSON.stringify(input.config)
  );
  const credential = await prisma.integrationCredential.upsert({
    where: { kind },
    create: {
      kind,
      displayName,
      enabled: input.enabled,
      encryptedConfig,
      metadata: input.metadata
    },
    update: {
      displayName,
      enabled: input.enabled,
      encryptedConfig,
      metadata: input.metadata,
      lastErrorCode: null
    },
    select: {
      id: true,
      kind: true,
      displayName: true,
      enabled: true,
      metadata: true,
      lastTestedAt: true,
      lastSuccessAt: true,
      lastErrorCode: true
    }
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: "integration.credential_saved",
      entityType: "IntegrationCredential",
      entityId: credential.id,
      metadata: {
        kind,
        enabled: input.enabled
      }
    }
  });
  return credential;
}

export async function getIntegrationCredential(
  kind: string
): Promise<CredentialConfig | null> {
  const credential = await prisma.integrationCredential.findUnique({
    where: { kind },
    select: { enabled: true, encryptedConfig: true }
  });
  if (!credential?.enabled) {
    return null;
  }
  const value = JSON.parse(
    integrationCipher().decrypt(credential.encryptedConfig)
  ) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid encrypted integration credential");
  }
  return value as CredentialConfig;
}
