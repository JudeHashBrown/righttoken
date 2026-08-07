export type MailSendUser = {
  emailNormalized: string;
  unsubscribedAt: Date | null;
  pausedAt: Date | null;
};

export type MailSendDraft = {
  reviewedById: string | null;
  subject: string;
  bodyText: string;
  latestOutbound: {
    status: "SENT" | "BOUNCED";
    sentAt: Date;
  } | null;
  minimumContactIntervalMinutes: number;
};

export type MailSendBlockCode =
  | "RECIPIENT_SUPPRESSED"
  | "RECIPIENT_PAUSED"
  | "REVIEW_REQUIRED"
  | "UNRESOLVED_TEMPLATE_VARIABLE"
  | "CONTACT_FREQUENCY_LIMIT"
  | "SOURCE_USER_DELETED"
  | "EMPTY_MESSAGE";

export class MailSendBlockedError extends Error {
  constructor(readonly code: MailSendBlockCode) {
    super(code);
    this.name = "MailSendBlockedError";
  }
}

const unresolvedVariablePattern = /\[[^\[\]\n]{1,80}\]/;

export function assertMailSendAllowed(
  user: MailSendUser,
  draft: MailSendDraft,
  now = new Date()
): void {
  if (user.unsubscribedAt) {
    throw new MailSendBlockedError("RECIPIENT_SUPPRESSED");
  }
  if (user.pausedAt) {
    throw new MailSendBlockedError("RECIPIENT_PAUSED");
  }
  if (!draft.reviewedById) {
    throw new MailSendBlockedError("REVIEW_REQUIRED");
  }
  if (!draft.subject.trim() || !draft.bodyText.trim()) {
    throw new MailSendBlockedError("EMPTY_MESSAGE");
  }
  if (
    unresolvedVariablePattern.test(draft.subject) ||
    unresolvedVariablePattern.test(draft.bodyText)
  ) {
    throw new MailSendBlockedError(
      "UNRESOLVED_TEMPLATE_VARIABLE"
    );
  }
  if (
    draft.latestOutbound?.status === "SENT" &&
    draft.minimumContactIntervalMinutes > 0 &&
    now.getTime() - draft.latestOutbound.sentAt.getTime() <
      draft.minimumContactIntervalMinutes * 60 * 1000
  ) {
    throw new MailSendBlockedError("CONTACT_FREQUENCY_LIMIT");
  }
}
