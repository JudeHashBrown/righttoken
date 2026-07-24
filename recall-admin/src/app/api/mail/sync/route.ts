import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import { getMailboxRuntimeConfig } from "@/modules/mail/mailbox-credentials";
import { syncMailbox } from "@/modules/mail/sync-mailbox";

const syncSchema = z
  .object({ mailboxId: z.string().min(1) })
  .strict();

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "integrations:manage");
    const parsed = syncSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAIL_SYNC_REQUEST" },
        { status: 400 }
      );
    }
    const config = await getMailboxRuntimeConfig(
      parsed.data.mailboxId
    );
    return NextResponse.json(
      await syncMailbox(
        parsed.data.mailboxId,
        createSmtpImapAdapter(config)
      )
    );
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
    return NextResponse.json(
      { code: "MAIL_SYNC_FAILED" },
      { status: 502 }
    );
  }
}
