import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import { getMailboxRuntimeConfig } from "@/modules/mail/mailbox-credentials";
import {
  mailReplyRequestSchema
} from "@/modules/mail/reply-request-schema";
import {
  replyToMailThread
} from "@/modules/mail/reply-to-thread";
import { MailSendBlockedError } from "@/modules/mail/send-guard";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const parsed = mailReplyRequestSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAIL_REPLY_REQUEST" },
        { status: 400 }
      );
    }
    const config = await getMailboxRuntimeConfig(
      parsed.data.mailboxId
    );
    const message = await replyToMailThread(
      {
        actorId: member.id,
        ...parsed.data,
        minimumContactIntervalMinutes: 24 * 60
      },
      createSmtpImapAdapter(config)
    );
    return NextResponse.json({
      message: {
        id: message.id,
        status: message.status,
        sentAt: message.sentAt
      }
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    if (error instanceof MailSendBlockedError) {
      return NextResponse.json(
        { code: error.code },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        code:
          error instanceof Error &&
          error.message === "SMTP_SEND_FAILED"
            ? "SMTP_SEND_FAILED"
            : "MAIL_REPLY_FAILED"
      },
      { status: 502 }
    );
  }
}
