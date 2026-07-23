import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function isValidInternalBearer(
  authorizationHeader: string | null,
  currentSecret: string,
  previousSecret?: string
): boolean {
  const match = authorizationHeader?.match(/^Bearer ([^\s]+)$/);
  if (!match?.[1]) {
    return false;
  }

  const candidateDigest = digest(match[1]);
  return [currentSecret, previousSecret]
    .filter((secret): secret is string => Boolean(secret))
    .some((secret) =>
      timingSafeEqual(candidateDigest, digest(secret))
    );
}
