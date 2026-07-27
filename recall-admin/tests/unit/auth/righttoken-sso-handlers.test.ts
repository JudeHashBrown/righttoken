import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { Member } from "@/generated/prisma/client";
import type { RightTokenIdentity } from "@/modules/auth/righttoken-ticket";
import { createRightTokenAccessCheckHandler } from "@/modules/auth/righttoken-access-handler";
import { createRightTokenSsoCallbackHandler } from "@/modules/auth/righttoken-callback-handler";

const internalSecret = "i".repeat(32);
const identity: RightTokenIdentity = {
  rightTokenUserId: "rt-42",
  email: "operator@example.com",
  displayName: "运营一号",
  jti: "ticket-1234567890abcdef",
  issuedAt: new Date("2026-07-26T12:00:00.000Z"),
  expiresAt: new Date("2026-07-26T12:01:00.000Z")
};
const member = {
  id: "member-1",
  active: true,
  role: "OPERATOR"
} as Member;

function accessRequest(
  body: unknown,
  token = internalSecret
): NextRequest {
  return new NextRequest(
    "http://localhost/api/internal/righttoken/access-check",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
}

describe("RightToken access-check handler", () => {
  it("returns allowed only for active local members", async () => {
    const handler = createRightTokenAccessCheckHandler({
      getSecrets: () => ({ current: internalSecret }),
      findMember: async () => member
    });
    const response = await handler(
      accessRequest({
        externalUserId: "rt-42",
        email: "operator@example.com"
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      allowed: true
    });
  });

  it("fails closed for bad credentials, malformed identities, and unknown members", async () => {
    const handler = createRightTokenAccessCheckHandler({
      getSecrets: () => ({ current: internalSecret }),
      findMember: async () => null
    });

    expect(
      (await handler(accessRequest({}, "wrong-secret"))).status
    ).toBe(401);
    expect((await handler(accessRequest({}))).status).toBe(400);

    const denied = await handler(
      accessRequest({
        externalUserId: "rt-404",
        email: "unknown@example.com"
      })
    );
    expect(denied.status).toBe(200);
    await expect(denied.json()).resolves.toEqual({
      allowed: false
    });
  });
});

describe("RightToken SSO callback handler", () => {
  function callbackRequest(
    ticket = "valid-ticket",
    next = "/dashboard"
  ): NextRequest {
    const url = new URL(
      "http://localhost/api/auth/righttoken/callback"
    );
    url.searchParams.set("ticket", ticket);
    url.searchParams.set("next", next);
    return new NextRequest(url);
  }

  it("creates a secure recall session and redirects locally", async () => {
    const handler = createRightTokenSsoCallbackHandler({
      getConfig: () => ({
        appUrl: "https://recall.righttoken.ai",
        secret: "s".repeat(32),
        issuer: "https://righttoken.ai",
        audience: "righttoken-recall"
      }),
      verifyTicket: () => identity,
      resolveMember: async () => member,
      redeemJti: async () => true,
      createSession: async () => ({
        id: "session-1",
        token: "session-token",
        expiresAt: new Date("2026-07-27T00:00:00.000Z")
      })
    });

    const response = await handler(
      callbackRequest("valid-ticket", "/tasks?status=TODO")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://recall.righttoken.ai/tasks?status=TODO"
    );
    expect(response.cookies.get("rt_recall_session")?.value).toBe(
      "session-token"
    );
    expect(
      response.headers.get("set-cookie")
    ).toContain("HttpOnly");
  });

  it("denies unknown members and replayed tickets", async () => {
    const base = {
      getConfig: () => ({
        appUrl: "https://recall.righttoken.ai",
        secret: "s".repeat(32),
        issuer: "https://righttoken.ai",
        audience: "righttoken-recall"
      }),
      verifyTicket: () => identity,
      createSession: async () => ({
        id: "session-1",
        token: "session-token",
        expiresAt: new Date("2026-07-27T00:00:00.000Z")
      })
    };

    const unknown = createRightTokenSsoCallbackHandler({
      ...base,
      resolveMember: async () => null,
      redeemJti: async () => true
    });
    expect((await unknown(callbackRequest())).status).toBe(403);

    const replay = createRightTokenSsoCallbackHandler({
      ...base,
      resolveMember: async () => member,
      redeemJti: async () => false
    });
    expect((await replay(callbackRequest())).status).toBe(401);
  });

  it("falls back to dashboard for external redirect targets", async () => {
    const handler = createRightTokenSsoCallbackHandler({
      getConfig: () => ({
        appUrl: "https://recall.righttoken.ai",
        secret: "s".repeat(32),
        issuer: "https://righttoken.ai",
        audience: "righttoken-recall"
      }),
      verifyTicket: () => identity,
      resolveMember: async () => member,
      redeemJti: async () => true,
      createSession: async () => ({
        id: "session-1",
        token: "session-token",
        expiresAt: new Date("2026-07-27T00:00:00.000Z")
      })
    });

    const response = await handler(
      callbackRequest("valid-ticket", "https://attacker.example")
    );
    expect(response.headers.get("location")).toBe(
      "https://recall.righttoken.ai/dashboard"
    );
  });
});
