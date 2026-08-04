import { describe, expect, it } from "vitest";
import {
  parseDeliveryStatus
} from "@/modules/mail/delivery-status";
import type { MailboxMessage } from "@/modules/mail/types";

function mailboxMessage(input: {
  bodyText?: string;
  deliveryStatus?: string;
  subject?: string;
}): MailboxMessage {
  return {
    providerMessageId: "<dsn-1@example.test>",
    inReplyTo: null,
    references: [],
    fromAddress: "mailer-daemon@example.test",
    toAddresses: ["support@righttoken.test"],
    subject: input.subject ?? "Delivery Status Notification",
    bodyText: input.bodyText ?? "",
    bodyHtml: null,
    attachments: input.deliveryStatus
      ? [
          {
            fileName: "delivery-status.txt",
            contentType: "message/delivery-status",
            content: Buffer.from(input.deliveryStatus),
            cid: null,
            disposition: "ATTACHMENT"
          }
        ]
      : [],
    receivedAt: new Date("2026-08-04T08:00:00.000Z")
  };
}

describe("parseDeliveryStatus", () => {
  it("parses a final failed recipient from a standard DSN part", () => {
    const parsed = parseDeliveryStatus(
      mailboxMessage({
        deliveryStatus: [
          "Reporting-MTA: dns; mx.example.test",
          "Original-Message-ID: <outbound-1@example.test>",
          "",
          "Final-Recipient: rfc822; Bad.User@Example.com",
          "Action: failed",
          "Status: 5.1.1",
          "Diagnostic-Code: smtp; 550 mailbox unavailable"
        ].join("\r\n")
      })
    );

    expect(parsed).toEqual({
      inboundProviderMessageId: "<dsn-1@example.test>",
      reportedAt: new Date("2026-08-04T08:00:00.000Z"),
      recipients: [
        {
          action: "FAILED",
          recipientNormalized: "bad.user@example.com",
          statusCode: "5.1.1",
          diagnosticCode: "smtp; 550 mailbox unavailable",
          originalMessageId: "<outbound-1@example.test>"
        }
      ]
    });
  });

  it("parses multiple delayed and delivered recipient blocks", () => {
    const parsed = parseDeliveryStatus(
      mailboxMessage({
        deliveryStatus: [
          "Original-Message-ID: <outbound-2@example.test>",
          "",
          "Final-Recipient: rfc822; slow@example.com",
          "Action: delayed",
          "Status: 4.2.0",
          "Diagnostic-Code: smtp; 451 queued",
          " for another attempt",
          "",
          "Original-Recipient: rfc822; ok@example.com",
          "Action: delivered",
          "Status: 2.0.0"
        ].join("\r\n")
      })
    );

    expect(parsed?.recipients).toEqual([
      expect.objectContaining({
        action: "DELAYED",
        recipientNormalized: "slow@example.com",
        diagnosticCode: "smtp; 451 queued for another attempt"
      }),
      expect.objectContaining({
        action: "DELIVERED",
        recipientNormalized: "ok@example.com"
      })
    ]);
  });

  it("uses only explicit body fields as the compatibility path", () => {
    expect(
      parseDeliveryStatus(
        mailboxMessage({
          bodyText: [
            "Final-Recipient: rfc822; fallback@example.com",
            "Action: failed",
            "Status: 5.0.0"
          ].join("\n")
        })
      )?.recipients
    ).toEqual([
      expect.objectContaining({
        action: "FAILED",
        recipientNormalized: "fallback@example.com"
      })
    ]);

    expect(
      parseDeliveryStatus(
        mailboxMessage({
          subject: "Mail delivery failed",
          bodyText: "The server rejected this message."
        })
      )
    ).toBeNull();
  });

  it("rejects malformed recipients and limits diagnostic storage", () => {
    const longDiagnostic = `smtp; 550 ${"x".repeat(3_000)}`;
    const parsed = parseDeliveryStatus(
      mailboxMessage({
        deliveryStatus: [
          "Final-Recipient: rfc822; valid@example.com",
          "Action: failed",
          `Diagnostic-Code: ${longDiagnostic}`,
          "",
          "Final-Recipient: rfc822; not-an-email",
          "Action: failed"
        ].join("\n")
      })
    );

    expect(parsed?.recipients).toHaveLength(1);
    expect(
      parsed?.recipients[0]?.diagnosticCode
    ).toHaveLength(2_000);
  });
});
