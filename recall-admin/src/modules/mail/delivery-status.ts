import type { MailboxMessage } from "@/modules/mail/types";

export type DeliveryStatusRecipient = {
  action: "FAILED" | "DELAYED" | "DELIVERED" | "OTHER";
  recipientNormalized: string;
  statusCode: string | null;
  diagnosticCode: string | null;
  originalMessageId: string | null;
};

export type ParsedDeliveryStatus = {
  inboundProviderMessageId: string;
  reportedAt: Date;
  recipients: DeliveryStatusRecipient[];
  malformedRecipientBlocks: number;
};

export type DeliveryStatusInspection =
  | { kind: "NOT_DSN" }
  | { kind: "MALFORMED" }
  | {
      kind: "PARSED";
      deliveryStatus: ParsedDeliveryStatus;
    };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function headerBlocks(source: string): Array<Map<string, string>> {
  return source
    .replace(/\r?\n[\t ]+/g, " ")
    .split(/\r?\n\r?\n+/)
    .map((block) => {
      const headers = new Map<string, string>();
      for (const line of block.split(/\r?\n/)) {
        const match = /^([^:]+):[\t ]*(.*)$/.exec(line);
        if (!match) continue;
        const name = match[1]?.trim().toLowerCase();
        const value = match[2]?.trim();
        if (name && value && !headers.has(name)) {
          headers.set(name, value);
        }
      }
      return headers;
    })
    .filter((headers) => headers.size > 0);
}

function normalizedRecipient(value: string | undefined): string | null {
  const address = value
    ?.split(";")
    .at(-1)
    ?.trim()
    .replace(/^<|>$/g, "")
    .toLowerCase();
  return address && emailPattern.test(address) ? address : null;
}

function normalizedAction(
  value: string | undefined
): DeliveryStatusRecipient["action"] | null {
  if (!value) return null;
  const action = value.trim().toLowerCase();
  if (action === "failed") return "FAILED";
  if (action === "delayed") return "DELAYED";
  if (action === "delivered") return "DELIVERED";
  return "OTHER";
}

function attachedOriginalMessageId(
  message: MailboxMessage
): string | null {
  for (const attachment of message.attachments) {
    if (attachment.contentType.toLowerCase() !== "message/rfc822") {
      continue;
    }
    const match = /^Message-ID:[\t ]*(.+)$/im.exec(
      attachment.content.toString("utf8")
    );
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function recipientsFromSource(
  source: string,
  fallbackMessageId: string | null
): {
  recipients: DeliveryStatusRecipient[];
  malformedRecipientBlocks: number;
} {
  const blocks = headerBlocks(source);
  const messageId =
    blocks
      .map((headers) => headers.get("original-message-id"))
      .find(Boolean)
      ?.slice(0, 998) ?? fallbackMessageId;

  let malformedRecipientBlocks = 0;
  const recipients = blocks.flatMap((headers) => {
    const hasRecipientFields =
      headers.has("action") ||
      headers.has("final-recipient") ||
      headers.has("original-recipient");
    if (!hasRecipientFields) return [];
    const action = normalizedAction(headers.get("action"));
    const recipient = normalizedRecipient(
      headers.get("final-recipient") ??
        headers.get("original-recipient")
    );
    if (!action || !recipient) {
      malformedRecipientBlocks += 1;
      return [];
    }
    return [
      {
        action,
        recipientNormalized: recipient,
        statusCode: headers.get("status")?.slice(0, 128) ?? null,
        diagnosticCode:
          headers.get("diagnostic-code")?.slice(0, 2_000) ?? null,
        originalMessageId:
          headers.get("original-message-id")?.slice(0, 998) ??
          messageId ??
          null
      }
    ];
  });
  return { recipients, malformedRecipientBlocks };
}

export function inspectDeliveryStatus(
  message: MailboxMessage
): DeliveryStatusInspection {
  const deliveryParts = message.attachments.filter(
    (attachment) =>
      attachment.contentType.toLowerCase() ===
      "message/delivery-status"
  );
  const sources = deliveryParts.length
    ? deliveryParts.map((attachment) =>
        attachment.content.toString("utf8")
      )
    : /^(?:Action|Final-Recipient|Original-Recipient):/im.test(
          message.bodyText
        ) && /^Action:/im.test(message.bodyText)
      ? [message.bodyText]
      : [];
  if (sources.length === 0) return { kind: "NOT_DSN" };

  const attachedMessageId = attachedOriginalMessageId(message);
  const parsedSources = sources.map((source) =>
    recipientsFromSource(source, attachedMessageId)
  );
  const recipients = parsedSources.flatMap(
    (parsed) => parsed.recipients
  );
  const malformedRecipientBlocks = parsedSources.reduce(
    (total, parsed) => total + parsed.malformedRecipientBlocks,
    0
  );
  return recipients.length > 0
    ? {
        kind: "PARSED",
        deliveryStatus: {
          inboundProviderMessageId: message.providerMessageId,
          reportedAt: message.receivedAt,
          recipients,
          malformedRecipientBlocks
        }
      }
    : { kind: "MALFORMED" };
}

export function parseDeliveryStatus(
  message: MailboxMessage
): ParsedDeliveryStatus | null {
  const inspected = inspectDeliveryStatus(message);
  return inspected.kind === "PARSED"
    ? inspected.deliveryStatus
    : null;
}
