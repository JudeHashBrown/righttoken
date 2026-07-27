import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  RightTokenTicketError,
  verifyRightTokenTicket
} from "@/modules/auth/righttoken-ticket";

const secret = "s".repeat(32);
const now = new Date("2026-07-26T12:00:00.000Z");

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(
  payload: Record<string, unknown>,
  signingSecret = secret,
  header: Record<string, unknown> = {
    alg: "HS256",
    typ: "JWT"
  }
): string {
  const message = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac("sha256", signingSecret)
    .update(message)
    .digest("base64url");
  return `${message}.${signature}`;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    iss: "https://righttoken.ai",
    aud: "righttoken-recall",
    sub: "42",
    email: "operator@example.com",
    name: "运营一号",
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + 60,
    jti: "ticket-1234567890abcdef",
    ...overrides
  };
}

describe("verifyRightTokenTicket", () => {
  it("verifies a valid RightToken SSO ticket", () => {
    const identity = verifyRightTokenTicket(
      sign(validPayload()),
      {
        secret,
        issuer: "https://righttoken.ai",
        audience: "righttoken-recall"
      },
      now
    );

    expect(identity).toEqual({
      rightTokenUserId: "42",
      email: "operator@example.com",
      displayName: "运营一号",
      jti: "ticket-1234567890abcdef",
      issuedAt: new Date("2026-07-26T12:00:00.000Z"),
      expiresAt: new Date("2026-07-26T12:01:00.000Z")
    });
  });

  it.each([
    ["expired", { exp: Math.floor(now.getTime() / 1000) - 1 }],
    [
      "expired at the current second",
      { exp: Math.floor(now.getTime() / 1000) }
    ],
    ["wrong audience", { aud: "another-app" }],
    ["wrong issuer", { iss: "https://attacker.example" }],
    ["too long lived", { exp: Math.floor(now.getTime() / 1000) + 61 }],
    ["missing subject", { sub: "" }],
    ["invalid email", { email: "not-an-email" }]
  ])("rejects %s tickets", (_label, overrides) => {
    expect(() =>
      verifyRightTokenTicket(
        sign(validPayload(overrides)),
        {
          secret,
          issuer: "https://righttoken.ai",
          audience: "righttoken-recall"
        },
        now
      )
    ).toThrow(RightTokenTicketError);
  });

  it("rejects a ticket signed with another secret", () => {
    expect(() =>
      verifyRightTokenTicket(
        sign(validPayload(), "x".repeat(32)),
        {
          secret,
          issuer: "https://righttoken.ai",
          audience: "righttoken-recall"
        },
        now
      )
    ).toThrow("invalid ticket signature");
  });

  it("rejects non-HS256 headers and malformed compact values", () => {
    expect(() =>
      verifyRightTokenTicket(
        sign(validPayload(), secret, {
          alg: "none",
          typ: "JWT"
        }),
        {
          secret,
          issuer: "https://righttoken.ai",
          audience: "righttoken-recall"
        },
        now
      )
    ).toThrow("unsupported ticket algorithm");

    expect(() =>
      verifyRightTokenTicket(
        "not-a-ticket",
        {
          secret,
          issuer: "https://righttoken.ai",
          audience: "righttoken-recall"
        },
        now
      )
    ).toThrow("malformed ticket");
  });
});
