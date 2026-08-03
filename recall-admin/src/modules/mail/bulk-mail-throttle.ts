export const BULK_MAIL_MIN_DELAY_SECONDS = 120;
export const BULK_MAIL_MAX_DELAY_SECONDS = 240;

export function senderDomainFromAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  const domain = normalized.slice(separator + 1);

  if (
    separator <= 0 ||
    !domain ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    !domain.includes(".")
  ) {
    throw new Error("INVALID_SENDER_ADDRESS");
  }

  return domain;
}

export function randomBulkMailDelayMs(
  random: () => number = Math.random
): number {
  const unit = Math.min(Math.max(random(), 0), 0.999_999_999_999);
  const seconds =
    BULK_MAIL_MIN_DELAY_SECONDS +
    Math.floor(
      unit *
        (BULK_MAIL_MAX_DELAY_SECONDS - BULK_MAIL_MIN_DELAY_SECONDS + 1)
    );

  return seconds * 1_000;
}
