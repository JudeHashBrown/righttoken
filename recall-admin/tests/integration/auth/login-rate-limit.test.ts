import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  getLoginRateLimitStatus,
  recordLoginAttempt
} from "@/modules/auth/login-rate-limit";

describe("persistent login rate limiting", () => {
  const startedAt = new Date();
  const email = `rate-${randomUUID()}@example.test`;
  const ipAddress = `198.51.100.${Math.floor(Math.random() * 100) + 1}`;

  beforeAll(async () => {
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { gte: startedAt } }
    });
  });

  afterAll(async () => {
    await prisma.loginAttempt.deleteMany({
      where: { createdAt: { gte: startedAt } }
    });
    await prisma.$disconnect();
  });

  it("blocks the fifth recent failure for the same email or IP", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await recordLoginAttempt(email, ipAddress, false);
    }

    await expect(
      getLoginRateLimitStatus(email, ipAddress)
    ).resolves.toMatchObject({ limited: false, failureCount: 4 });

    await recordLoginAttempt(email, ipAddress, false);

    await expect(
      getLoginRateLimitStatus(email, ipAddress)
    ).resolves.toMatchObject({ limited: true, failureCount: 5 });
  });

  it("never stores plaintext email or IP identifiers", async () => {
    const stored = await prisma.loginAttempt.findFirstOrThrow({
      where: { createdAt: { gte: startedAt } }
    });

    expect(stored.emailHash).not.toContain(email);
    expect(stored.ipHash).not.toContain(ipAddress);
  });
});
