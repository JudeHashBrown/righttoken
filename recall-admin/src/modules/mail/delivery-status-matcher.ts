import type {
  DeliveryStatusRecipient
} from "@/modules/mail/delivery-status";

export type OutboundDeliveryCandidate = {
  messageId: string;
  providerMessageId: string | null;
  mailboxId: string;
  recipientNormalized: string;
  normalizedSubject: string;
  sentAt: Date;
};

type DeliveryStatusMatchInput = {
  recipient: DeliveryStatusRecipient;
  inbound: {
    mailboxId: string;
    inReplyTo: string | null;
    references: string[];
    subject: string;
    reportedAt: Date;
  };
};

export type DeliveryStatusMatch =
  | { kind: "MATCHED"; messageId: string }
  | {
      kind: "UNMATCHED";
      reason:
        | "AMBIGUOUS_DELIVERY_STATUS"
        | "DELIVERY_STATUS_MESSAGE_NOT_FOUND";
    };

export function normalizeDeliveryMessageId(
  value: string | null
): string | null {
  const normalized = value
    ?.trim()
    .replace(/^<|>$/g, "")
    .trim()
    .toLowerCase();
  return normalized || null;
}

export function normalizeDeliverySubject(value: string): string {
  let normalized = value.trim();
  while (/^(?:re|fw|fwd)\s*:/i.test(normalized)) {
    normalized = normalized.replace(
      /^(?:re|fw|fwd)\s*:\s*/i,
      ""
    );
  }
  return normalized.replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueResult(
  candidates: OutboundDeliveryCandidate[]
): DeliveryStatusMatch {
  if (candidates.length === 1) {
    return {
      kind: "MATCHED",
      messageId: candidates[0]!.messageId
    };
  }
  return candidates.length > 1
    ? {
        kind: "UNMATCHED",
        reason: "AMBIGUOUS_DELIVERY_STATUS"
      }
    : {
        kind: "UNMATCHED",
        reason: "DELIVERY_STATUS_MESSAGE_NOT_FOUND"
      };
}

export function matchDeliveryStatusRecipient(
  input: DeliveryStatusMatchInput,
  candidates: OutboundDeliveryCandidate[]
): DeliveryStatusMatch {
  const sameMailbox = candidates.filter(
    (candidate) => candidate.mailboxId === input.inbound.mailboxId
  );
  const originalMessageId = normalizeDeliveryMessageId(
    input.recipient.originalMessageId
  );
  if (originalMessageId) {
    return uniqueResult(
      sameMailbox.filter(
        (candidate) =>
          normalizeDeliveryMessageId(
            candidate.providerMessageId
          ) === originalMessageId
      )
    );
  }

  const replyIds = new Set(
    [input.inbound.inReplyTo, ...input.inbound.references]
      .map(normalizeDeliveryMessageId)
      .filter((value): value is string => Boolean(value))
  );
  if (replyIds.size > 0) {
    return uniqueResult(
      sameMailbox.filter((candidate) => {
        const messageId = normalizeDeliveryMessageId(
          candidate.providerMessageId
        );
        return Boolean(messageId && replyIds.has(messageId));
      })
    );
  }

  const earliest = new Date(
    input.inbound.reportedAt.getTime() - 30 * 24 * 60 * 60_000
  );
  const subject = normalizeDeliverySubject(input.inbound.subject);
  return uniqueResult(
    sameMailbox.filter(
      (candidate) =>
        candidate.recipientNormalized ===
          input.recipient.recipientNormalized &&
        candidate.normalizedSubject === subject &&
        candidate.sentAt >= earliest &&
        candidate.sentAt <= input.inbound.reportedAt
    )
  );
}
