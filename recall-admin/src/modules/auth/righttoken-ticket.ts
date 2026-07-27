import {
  createHmac,
  timingSafeEqual
} from "node:crypto";
import { z } from "zod";

const MAX_TICKET_LENGTH = 8_192;
const MAX_TICKET_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 5;

const headerSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.literal("JWT")
});

const claimsSchema = z.object({
  iss: z.string().min(1),
  aud: z.string().min(1),
  sub: z.string().min(1).max(255),
  email: z.string().email().max(320),
  name: z.string().max(255).optional().default(""),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  jti: z.string().min(16).max(255)
});

export type RightTokenTicketConfig = {
  secret: string;
  issuer: string;
  audience: string;
};

export type RightTokenIdentity = {
  rightTokenUserId: string;
  email: string;
  displayName: string;
  jti: string;
  issuedAt: Date;
  expiresAt: Date;
};

export class RightTokenTicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RightTokenTicketError";
  }
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new RightTokenTicketError("malformed ticket");
  }
}

function verifySignature(
  message: string,
  encodedSignature: string,
  secret: string
): void {
  let received: Buffer;
  try {
    received = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new RightTokenTicketError("malformed ticket");
  }
  const expected = createHmac("sha256", secret)
    .update(message)
    .digest();
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new RightTokenTicketError("invalid ticket signature");
  }
}

export function verifyRightTokenTicket(
  ticket: string,
  config: RightTokenTicketConfig,
  now = new Date()
): RightTokenIdentity {
  if (
    !ticket ||
    ticket.length > MAX_TICKET_LENGTH ||
    config.secret.length < 32
  ) {
    throw new RightTokenTicketError("malformed ticket");
  }

  const parts = ticket.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new RightTokenTicketError("malformed ticket");
  }

  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const headerResult = headerSchema.safeParse(
    decodeJson(encodedHeader)
  );
  if (!headerResult.success) {
    throw new RightTokenTicketError("unsupported ticket algorithm");
  }

  const message = `${encodedHeader}.${encodedClaims}`;
  verifySignature(message, encodedSignature, config.secret);

  const claimsResult = claimsSchema.safeParse(
    decodeJson(encodedClaims)
  );
  if (!claimsResult.success) {
    throw new RightTokenTicketError("invalid ticket claims");
  }

  const claims = claimsResult.data;
  if (
    claims.iss !== config.issuer ||
    claims.aud !== config.audience
  ) {
    throw new RightTokenTicketError("invalid ticket claims");
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    claims.exp <= nowSeconds ||
    claims.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > MAX_TICKET_LIFETIME_SECONDS
  ) {
    throw new RightTokenTicketError("invalid ticket time window");
  }

  return {
    rightTokenUserId: claims.sub,
    email: claims.email.trim().toLowerCase(),
    displayName: claims.name.trim(),
    jti: claims.jti,
    issuedAt: new Date(claims.iat * 1000),
    expiresAt: new Date(claims.exp * 1000)
  };
}
