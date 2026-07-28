import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;

export type LoginRateLimitStatus = {
  limited: boolean;
  failureCount: number;
  retryAt: Date;
};

function hashIdentifier(value: string): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret) {
    throw new Error("SESSION_COOKIE_SECRET is required");
  }

  return createHmac("sha256", secret)
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export async function recordLoginAttempt(
  email: string,
  ipAddress: string,
  succeeded: boolean
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      emailHash: hashIdentifier(email),
      ipHash: hashIdentifier(ipAddress),
      succeeded
    }
  });
}

export async function getLoginRateLimitStatus(
  email: string,
  ipAddress: string,
  now = new Date()
): Promise<LoginRateLimitStatus> {
  const retryAt = new Date(now.getTime() + LOGIN_WINDOW_MS);
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const emailHash = hashIdentifier(email);
  const ipHash = hashIdentifier(ipAddress);
  const failureCount = await prisma.loginAttempt.count({
    where: {
      succeeded: false,
      createdAt: { gte: since },
      OR: [{ emailHash }, { ipHash }]
    }
  });

  return {
    limited: failureCount >= LOGIN_FAILURE_LIMIT,
    failureCount,
    retryAt
  };
}
