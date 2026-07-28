import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import {
  generate,
  generateSecret,
  generateURI,
  verify
} from "otplib";
import QRCode from "qrcode";
import { createFieldCipher } from "@/lib/crypto/field-encryption";

const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const RECOVERY_CODE_COUNT = 10;
const PENDING_SETUP_DURATION_MS = 10 * 60 * 1000;

type PendingTwoFactorSetup = {
  memberId: string;
  secret: string;
  expiresAt: string;
};

function getFieldCipher() {
  const encodedKey = process.env.APP_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(Buffer.from(encodedKey, "base64"));
}

export async function createTwoFactorMaterial(
  accountName: string
): Promise<{
  secret: string;
  otpauthUrl: string;
  totp: { generate(): Promise<string> };
}> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: "RightToken 用户运营",
    label: accountName,
    secret,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS
  });

  return {
    secret,
    otpauthUrl,
    totp: {
      generate: () =>
        generate({
          secret,
          digits: TOTP_DIGITS,
          period: TOTP_PERIOD_SECONDS
        })
    }
  };
}

export async function verifyTotp(
  secret: string,
  code: string
): Promise<boolean> {
  const result = await verify({
    secret,
    token: code,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    epochTolerance: TOTP_PERIOD_SECONDS
  });
  return result.valid;
}

export async function createRecoveryCodes(): Promise<{
  plaintext: string[];
  hashes: string[];
}> {
  const plaintext = Array.from(
    { length: RECOVERY_CODE_COUNT },
    () => {
      const value = randomBytes(8)
        .toString("hex")
        .toUpperCase();
      return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(
        8,
        12
      )}-${value.slice(12)}`;
    }
  );
  const hashes = await Promise.all(
    plaintext.map((code) =>
      argon2.hash(code, { type: argon2.argon2id })
    )
  );

  return { plaintext, hashes };
}

export async function beginTwoFactorSetup(
  memberId: string
): Promise<{
  otpauthUrl: string;
  qrDataUrl: string;
  pendingSecretToken: string;
}> {
  const { prisma } = await import("@/lib/db/prisma");
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { email: true }
  });
  const material = await createTwoFactorMaterial(member.email);
  const pending: PendingTwoFactorSetup = {
    memberId,
    secret: material.secret,
    expiresAt: new Date(
      Date.now() + PENDING_SETUP_DURATION_MS
    ).toISOString()
  };

  return {
    otpauthUrl: material.otpauthUrl,
    qrDataUrl: await QRCode.toDataURL(material.otpauthUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: "M"
    }),
    pendingSecretToken: getFieldCipher().encrypt(
      JSON.stringify(pending)
    )
  };
}

function decodePendingSetup(
  memberId: string,
  token: string
): PendingTwoFactorSetup {
  const value = JSON.parse(
    getFieldCipher().decrypt(token)
  ) as PendingTwoFactorSetup;

  if (
    value.memberId !== memberId ||
    !value.secret ||
    new Date(value.expiresAt) <= new Date()
  ) {
    throw new Error("invalid or expired two-factor setup");
  }
  return value;
}

export async function confirmTwoFactorSetup(
  memberId: string,
  pendingSecretToken: string,
  code: string
): Promise<{ recoveryCodes: string[] }> {
  const { prisma } = await import("@/lib/db/prisma");
  const pending = decodePendingSetup(memberId, pendingSecretToken);
  if (!(await verifyTotp(pending.secret, code))) {
    throw new Error("invalid two-factor code");
  }

  const recoveryCodes = await createRecoveryCodes();
  const encryptedSecret = getFieldCipher().encrypt(pending.secret);

  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorOn: true
      }
    });
    await tx.recoveryCode.deleteMany({ where: { memberId } });
    await tx.recoveryCode.createMany({
      data: recoveryCodes.hashes.map((codeHash) => ({
        memberId,
        codeHash
      }))
    });
  });

  return { recoveryCodes: recoveryCodes.plaintext };
}

export async function verifySecondFactor(
  memberId: string,
  code: string
): Promise<boolean> {
  const { prisma } = await import("@/lib/db/prisma");
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      twoFactorOn: true,
      twoFactorSecret: true,
      recoveryCodes: {
        where: { usedAt: null },
        select: { id: true, codeHash: true }
      }
    }
  });

  if (!member?.twoFactorOn || !member.twoFactorSecret) {
    return false;
  }

  const normalizedCode = code.trim().toUpperCase();
  const secret = getFieldCipher().decrypt(member.twoFactorSecret);
  if (
    /^\d{6}$/.test(normalizedCode) &&
    (await verifyTotp(secret, normalizedCode))
  ) {
    return true;
  }

  for (const recoveryCode of member.recoveryCodes) {
    if (await argon2.verify(recoveryCode.codeHash, normalizedCode)) {
      const result = await prisma.recoveryCode.updateMany({
        where: { id: recoveryCode.id, usedAt: null },
        data: { usedAt: new Date() }
      });
      return result.count === 1;
    }
  }

  return false;
}
