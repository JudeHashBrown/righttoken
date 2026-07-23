import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/modules/auth/password";
import {
  AUTH_STATE_COOKIE_NAME,
  findMemberBySessionToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

describe("login and logout routes", () => {
  const email = `login-${randomUUID()}@example.test`;
  const password = "a-secure-login-test-password";
  let memberId: string;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email,
        displayName: "Login Test",
        passwordHash: await hashPassword(password),
        role: "OPERATOR"
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

  it("rejects a cross-origin login request", async () => {
    const response = await login(
      new NextRequest("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example"
        },
        body: JSON.stringify({ email, password })
      })
    );

    expect(response.status).toBe(403);
  });

  it("creates an HTTP-only session and revokes it on logout", async () => {
    const response = await login(
      new NextRequest("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3000",
          "x-forwarded-for": "198.51.100.42"
        },
        body: JSON.stringify({ email, password })
      })
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");

    const token = setCookie.match(
      new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`)
    )?.[1];
    expect(token).toBeTruthy();
    expect((await findMemberBySessionToken(token!))?.id).toBe(memberId);

    const logoutResponse = await logout(
      new NextRequest("http://127.0.0.1:3000/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3000",
          cookie: `${SESSION_COOKIE_NAME}=${token}`
        }
      })
    );

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie")).toContain(
      `${AUTH_STATE_COOKIE_NAME}=;`
    );
    expect(await findMemberBySessionToken(token!)).toBeNull();
  });

  it("returns a generic error for an incorrect password", async () => {
    const response = await login(
      new NextRequest("http://127.0.0.1:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3000",
          "x-forwarded-for": "198.51.100.43"
        },
        body: JSON.stringify({
          email,
          password: "an-incorrect-login-password"
        })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CREDENTIALS"
    });
  });
});
