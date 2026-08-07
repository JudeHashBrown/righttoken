import { describe, expect, it } from "vitest";
import {
  assertMailSendAllowed,
  MailSendBlockedError
} from "@/modules/mail/send-guard";

const now = new Date("2026-07-24T10:00:00.000Z");
const user = {
  emailNormalized: "user@example.test",
  unsubscribedAt: null,
  pausedAt: null
};
const draft = {
  reviewedById: "member-1",
  subject: "RightToken 使用提醒",
  bodyText: "你好，欢迎继续使用 RightToken。",
  latestOutbound: null,
  minimumContactIntervalMinutes: 24 * 60
};

describe("assertMailSendAllowed", () => {
  it.each([
    [
      { ...user, unsubscribedAt: now },
      draft,
      "RECIPIENT_SUPPRESSED"
    ],
    [{ ...user, pausedAt: now }, draft, "RECIPIENT_PAUSED"],
    [
      user,
      { ...draft, reviewedById: null },
      "REVIEW_REQUIRED"
    ],
    [
      user,
      { ...draft, bodyText: "你好，[称呼]" },
      "UNRESOLVED_TEMPLATE_VARIABLE"
    ],
    [
      user,
      {
        ...draft,
        latestOutbound: {
          status: "SENT" as const,
          sentAt: new Date("2026-07-24T09:00:00.000Z")
        }
      },
      "CONTACT_FREQUENCY_LIMIT"
    ]
  ] as const)("blocks unsafe mail with %s", (subject, message, code) => {
    expect(() =>
      assertMailSendAllowed(subject, message, now)
    ).toThrowError(
      expect.objectContaining<Partial<MailSendBlockedError>>({ code })
    );
  });

  it("allows a reviewed, resolved and eligible message", () => {
    expect(() =>
      assertMailSendAllowed(user, draft, now)
    ).not.toThrow();
  });

  it("allows retry when the latest outbound message finally bounced", () => {
    expect(() =>
      assertMailSendAllowed(
        user,
        {
          ...draft,
          latestOutbound: {
            status: "BOUNCED",
            sentAt: new Date("2026-07-24T09:59:00.000Z")
          }
        },
        now
      )
    ).not.toThrow();
  });
});
