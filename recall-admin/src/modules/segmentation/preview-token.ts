import {
  createHash,
  createHmac,
  timingSafeEqual
} from "node:crypto";
import type { SegmentRuleSet } from "@/modules/segmentation/rule-definition";

export type SegmentPreviewTokenPayload = {
  actorId: string;
  draftHash: string;
  expiresAt: string;
};

function requireSecret(secret?: string): string {
  const value = secret ?? process.env.SESSION_COOKIE_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET is required");
  }
  return value;
}

function encode(payload: SegmentPreviewTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function hashSegmentRuleSet(ruleSet: SegmentRuleSet): string {
  const { changeSummary: _changeSummary, ...ruleDefinition } = ruleSet;
  return createHash("sha256")
    .update(JSON.stringify(ruleDefinition))
    .digest("hex");
}

export function signSegmentPreview(
  payload: SegmentPreviewTokenPayload,
  secret?: string
): string {
  const body = encode(payload);
  const signature = createHmac("sha256", requireSecret(secret))
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifySegmentPreview(
  token: string,
  actorId: string,
  draftHash: string,
  now = new Date(),
  secret?: string
): SegmentPreviewTokenPayload {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) {
    throw new Error("invalid segment preview token");
  }
  const expected = createHmac("sha256", requireSecret(secret))
    .update(body)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    throw new Error("invalid segment preview signature");
  }
  let payload: SegmentPreviewTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as SegmentPreviewTokenPayload;
  } catch {
    throw new Error("invalid segment preview payload");
  }
  if (
    payload.actorId !== actorId ||
    payload.draftHash !== draftHash
  ) {
    throw new Error("segment preview does not match this draft");
  }
  const expiresAt = new Date(payload.expiresAt);
  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime()
  ) {
    throw new Error("segment preview has expired");
  }
  return payload;
}
