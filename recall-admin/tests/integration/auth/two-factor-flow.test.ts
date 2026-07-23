import "dotenv/config";

import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  verifySecondFactor
} from "@/modules/auth/two-factor";

describe("two-factor enrollment and verification", () => {
  let memberId: string;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `two-factor-${randomUUID()}@example.test`,
        displayName: "Two Factor Test",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
      }
    });
    memberId = member.id;
  });

  afterAll(async () => {
    if (memberId) {
      await prisma.member.delete({ where: { id: memberId } });
    }
    await prisma.$disconnect();
  });

  it("enrolls an encrypted TOTP secret and one-time recovery codes", async () => {
    const setup = await beginTwoFactorSetup(memberId);
    const secret = new URL(setup.otpauthUrl).searchParams.get("secret");
    expect(secret).toBeTruthy();
    expect(setup.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(setup.pendingSecretToken).not.toContain(secret!);

    const code = await generate({ secret: secret! });
    const confirmed = await confirmTwoFactorSetup(
      memberId,
      setup.pendingSecretToken,
      code
    );

    const stored = await prisma.member.findUniqueOrThrow({
      where: { id: memberId },
      include: { recoveryCodes: true }
    });
    expect(stored.twoFactorOn).toBe(true);
    expect(stored.twoFactorSecret).not.toContain(secret!);
    expect(stored.recoveryCodes).toHaveLength(10);
    expect(stored.recoveryCodes[0]?.codeHash).not.toContain(
      confirmed.recoveryCodes[0]!
    );

    await expect(
      verifySecondFactor(memberId, await generate({ secret: secret! }))
    ).resolves.toBe(true);
    await expect(
      verifySecondFactor(memberId, confirmed.recoveryCodes[0]!)
    ).resolves.toBe(true);
    await expect(
      verifySecondFactor(memberId, confirmed.recoveryCodes[0]!)
    ).resolves.toBe(false);
  });
});
