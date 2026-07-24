export type InboundReplyCandidate = {
  providerMessageId: string;
  inReplyTo: string | null;
  references: string[];
  fromAddress: string;
  mailboxAddress: string;
  subject: string;
  receivedAt: Date;
};

export type OutboundReplyCandidate = {
  threadId: string;
  providerMessageId: string | null;
  recipientAddress: string;
  mailboxAddress: string;
  subject: string;
  sentAt: Date;
};

export type ReplyMatch =
  | { kind: "MATCHED"; threadId: string }
  | {
      kind: "UNMATCHED";
      reason: "NO_MATCH" | "AMBIGUOUS_FALLBACK";
    };

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function subjectStem(value: string): string {
  let result = value.trim();
  while (/^(re|fw|fwd)\s*:/i.test(result)) {
    result = result.replace(/^(re|fw|fwd)\s*:\s*/i, "");
  }
  return result.trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchInboundReply(
  inbound: InboundReplyCandidate,
  outbound: OutboundReplyCandidate[]
): ReplyMatch {
  const directIds = new Set(
    [inbound.inReplyTo, ...inbound.references].filter(
      (value): value is string => Boolean(value)
    )
  );
  const direct = outbound.find(
    (message) =>
      message.providerMessageId &&
      directIds.has(message.providerMessageId)
  );
  if (direct) {
    return { kind: "MATCHED", threadId: direct.threadId };
  }

  const earliest = new Date(
    inbound.receivedAt.getTime() - 30 * 24 * 60 * 60 * 1000
  );
  const fallback = outbound.filter(
    (message) =>
      message.sentAt >= earliest &&
      message.sentAt <= inbound.receivedAt &&
      normalizeAddress(message.recipientAddress) ===
        normalizeAddress(inbound.fromAddress) &&
      normalizeAddress(message.mailboxAddress) ===
        normalizeAddress(inbound.mailboxAddress) &&
      subjectStem(message.subject) === subjectStem(inbound.subject)
  );
  if (fallback.length === 1) {
    return { kind: "MATCHED", threadId: fallback[0]!.threadId };
  }
  return {
    kind: "UNMATCHED",
    reason: fallback.length > 1 ? "AMBIGUOUS_FALLBACK" : "NO_MATCH"
  };
}
