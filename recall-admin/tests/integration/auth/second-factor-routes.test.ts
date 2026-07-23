import "dotenv/config";

import { randomUUID } from "node:crypto";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as setupTwoFactor } from "@/app/api/auth/2fa/setup/route";
import { POST as verifyTwoFactor } from "@/app/api/auth/2fa/verify/route";
import { POST as reauthenticate } from "@/app/api/auth/reauthenticate/route";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/modules/auth/password";
import {
  AUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  createSession,
  revokeSessionByToken
} from "@/modules/auth/session";

function requestHeaders(cookie?: string): HeadersInit {
  return {
    "content-type": "application/json",
    origin: "http://127.0.0.1:3000",
    "x-forwarded-for": "198.51.100.84",
    ...(cookie ? { cookie } : {})
  };
}

describe("administrator second-factor routes", () => {
  const email = `second-factor-route-${randomUUID()}@example.test`;
  const password = "a-secure-second-factor-password";
  let memberId: string;
  const sessionTokens: string[] = [];

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email,
        displayName: "Second Factor Route",
        passwordHash: await hashPassword(password),
        role: "ADMIN"
      }
    });
    memberId = member.id;
  });

  afterAll(async () => {
    for (const token of sessionTokens) {
      await revokeSessionByToken(token);
    }
    if (memberId) {
      await prisma.member.delete({ where: { id: memberId } });
    }
    await prisma.$disconnect();
  });

  it("forces enrollment, confirms TOTP, and marks the session verified", async () => {
    const loginResponse = await login(
      new NextRequest("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ email, password })
      })
    );
    expect(loginResponse.status).toBe(200);
    await expect(loginResponse.json()).resolves.toMatchObject({
      nextStep: "ENROLL_2FA"
    });

    const setCookie = loginResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${AUTH_STATE_COOKIE_NAME}=enroll`);
    const sessionToken = setCookie.match(
      new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`)
    )?.[1];
    expect(sessionToken).toBeTruthy();
    sessionTokens.push(sessionToken!);
    const cookie = `${SESSION_COOKIE_NAME}=${sessionToken}; ${AUTH_STATE_COOKIE_NAME}=enroll`;

    const setupResponse = await setupTwoFactor(
      new NextRequest("http://127.0.0.1:3000/api/auth/2fa/setup", {
        method: "POST",
        headers: requestHeaders(cookie)
      })
    );
    expect(setupResponse.status).toBe(200);
    const setup = (await setupResponse.json()) as {
      otpauthUrl: string;
      pendingSecretToken: string;
    };
    const secret = new URL(setup.otpauthUrl).searchParams.get("secret");
    expect(secret).toBeTruthy();

    const verifyResponse = await verifyTwoFactor(
      new NextRequest("http://127.0.0.1:3000/api/auth/2fa/verify", {
        method: "POST",
        headers: requestHeaders(cookie),
        body: JSON.stringify({
          code: await generate({ secret: secret! }),
          pendingSecretToken: setup.pendingSecretToken
        })
      })
    );
    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toMatchObject({
      verified: true,
      recoveryCodes: expect.any(Array)
    });
    expect(verifyResponse.headers.get("set-cookie")).toContain(
      `${AUTH_STATE_COOKIE_NAME}=;`
    );

    const storedSession = await prisma.session.findFirstOrThrow({
      where: { memberId }
    });
    expect(storedSession.reauthenticatedAt).toBeInstanceOf(Date);
  });

  it("requires password plus TOTP for sensitive reauthentication", async () => {
    const session = await createSession(memberId);
    sessionTokens.push(session.token);
    const member = await prisma.member.findUniqueOrThrow({
      where: { id: memberId }
    });
    const encryptionKey = Buffer.from(
      process.env.APP_ENCRYPTION_KEY!,
      "base64"
    );
    const secret = createFieldCipher(encryptionKey).decrypt(
      member.twoFactorSecret!
    );

    const responseWithoutTotp = await reauthenticate(
      new NextRequest(
        "http://127.0.0.1:3000/api/auth/reauthenticate",
        {
          method: "POST",
          headers: requestHeaders(
            `${SESSION_COOKIE_NAME}=${session.token}`
          ),
          body: JSON.stringify({ password })
        }
      )
    );
    expect(responseWithoutTotp.status).toBe(401);
    expect(member.twoFactorOn).toBe(true);

    const response = await reauthenticate(
      new NextRequest(
        "http://127.0.0.1:3000/api/auth/reauthenticate",
        {
          method: "POST",
          headers: requestHeaders(
            `${SESSION_COOKIE_NAME}=${session.token}`
          ),
          body: JSON.stringify({
            password,
            code: await generate({ secret })
          })
        }
      )
    );
    expect(response.status).toBe(200);
    expect(
      (
        await prisma.session.findUniqueOrThrow({
          where: { id: session.id }
        })
      ).reauthenticatedAt
    ).toBeInstanceOf(Date);
  });
});
