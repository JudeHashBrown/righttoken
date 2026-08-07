import { describe, expect, it } from "vitest";
import type {
  DeliveryStatusRecipient
} from "@/modules/mail/delivery-status";
import {
  matchDeliveryStatusRecipient,
  normalizeDeliveryMessageId,
  normalizeDeliverySubject,
  type OutboundDeliveryCandidate
} from "@/modules/mail/delivery-status-matcher";

const recipient: DeliveryStatusRecipient = {
  action: "FAILED",
  recipientNormalized: "user@example.test",
  statusCode: "5.1.1",
  diagnosticCode: "smtp; 550 rejected",
  originalMessageId: null
};

function candidate(
  id: string,
  overrides: Partial<OutboundDeliveryCandidate> = {}
): OutboundDeliveryCandidate {
  return {
    messageId: id,
    providerMessageId: `<${id}@example.test>`,
    mailboxId: "mailbox-1",
    recipientNormalized: "user@example.test",
    normalizedSubject: "payment help",
    sentAt: new Date("2026-08-04T07:00:00.000Z"),
    ...overrides
  };
}

const inbound = {
  mailboxId: "mailbox-1",
  inReplyTo: null,
  references: [] as string[],
  subject: "Payment help",
  reportedAt: new Date("2026-08-04T08:00:00.000Z")
};

describe("delivery status matcher", () => {
  it("normalizes provider message ids and reply prefixes", () => {
    expect(normalizeDeliveryMessageId(" <ABC@Example.Test> ")).toBe(
      "abc@example.test"
    );
    expect(normalizeDeliverySubject("Re: Fwd: Payment help")).toBe(
      "payment help"
    );
  });

  it("prefers the original message id", () => {
    expect(
      matchDeliveryStatusRecipient(
        {
          recipient: {
            ...recipient,
            originalMessageId: " outbound-2@example.test "
          },
          inbound
        },
        [
          candidate("outbound-1"),
          candidate("outbound-2")
        ]
      )
    ).toEqual({ kind: "MATCHED", messageId: "outbound-2" });
  });

  it("uses reply headers when the original message id is absent", () => {
    expect(
      matchDeliveryStatusRecipient(
        {
          recipient,
          inbound: {
            ...inbound,
            references: ["<outbound-1@example.test>"]
          }
        },
        [candidate("outbound-1")]
      )
    ).toEqual({ kind: "MATCHED", messageId: "outbound-1" });
  });

  it("allows only a unique mailbox-recipient-subject fallback within 30 days", () => {
    expect(
      matchDeliveryStatusRecipient(
        { recipient, inbound },
        [
          candidate("wrong-mailbox", {
            mailboxId: "mailbox-2"
          }),
          candidate("too-old", {
            sentAt: new Date("2026-06-01T07:00:00.000Z")
          }),
          candidate("matched")
        ]
      )
    ).toEqual({ kind: "MATCHED", messageId: "matched" });
  });

  it("rejects ambiguous or missing fallback candidates", () => {
    expect(
      matchDeliveryStatusRecipient(
        { recipient, inbound },
        [candidate("one"), candidate("two")]
      )
    ).toEqual({
      kind: "UNMATCHED",
      reason: "AMBIGUOUS_DELIVERY_STATUS"
    });
    expect(
      matchDeliveryStatusRecipient(
        { recipient, inbound },
        [
          candidate("wrong-subject", {
            normalizedSubject: "another subject"
          })
        ]
      )
    ).toEqual({
      kind: "UNMATCHED",
      reason: "DELIVERY_STATUS_MESSAGE_NOT_FOUND"
    });
  });
});
