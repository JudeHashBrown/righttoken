import type { Prisma } from "@/generated/prisma/client";

export const BULK_MAIL_MIN_DELAY_SECONDS = 120;
export const BULK_MAIL_MAX_DELAY_SECONDS = 240;

export type BulkMailReservation =
  | { status: "WAIT"; runAt: Date }
  | { status: "EMPTY" }
  | {
      status: "CLAIMED";
      recipientId: string;
      claimedAt: Date;
      runAt: Date;
    };

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

export async function reserveBulkMailRecipient(
  tx: Prisma.TransactionClient,
  input: {
    batchId: string;
    senderDomain: string;
    now?: Date;
    random?: () => number;
  }
): Promise<BulkMailReservation> {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${input.senderDomain}, 0)
    )::text AS "locked"
  `;
  const claimedAt =
    input.now ??
    new Date(
      Number(
        (
          await tx.$queryRaw<Array<{ nowMs: bigint }>>`
            SELECT floor(
              extract(epoch FROM clock_timestamp()) * 1000
            )::bigint AS "nowMs"
          `
        )[0].nowMs
      )
    );
  const throttle = await tx.mailDomainThrottle.upsert({
    where: { senderDomain: input.senderDomain },
    create: {
      senderDomain: input.senderDomain,
      nextAvailableAt: claimedAt
    },
    update: {}
  });
  if (throttle.nextAvailableAt > claimedAt) {
    return {
      status: "WAIT",
      runAt: throttle.nextAvailableAt
    };
  }

  const recipient = await tx.mailBatchRecipient.findFirst({
    where: {
      batchId: input.batchId,
      status: "PENDING"
    },
    orderBy: { id: "asc" },
    select: { id: true }
  });
  if (!recipient) return { status: "EMPTY" };

  const claimed = await tx.mailBatchRecipient.updateMany({
    where: { id: recipient.id, status: "PENDING" },
    data: {
      status: "SENDING",
      claimedAt,
      lastAttemptAt: claimedAt,
      attempts: { increment: 1 }
    }
  });
  if (claimed.count !== 1) return { status: "EMPTY" };

  const runAt = new Date(
    claimedAt.getTime() + randomBulkMailDelayMs(input.random)
  );
  await tx.mailDomainThrottle.update({
    where: { senderDomain: input.senderDomain },
    data: { nextAvailableAt: runAt }
  });
  return {
    status: "CLAIMED",
    recipientId: recipient.id,
    claimedAt,
    runAt
  };
}
