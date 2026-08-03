import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import {
  getMailboxRuntimeConfiguration
} from "@/modules/mail/mailbox-credentials";
import {
  classifyMailSyncError
} from "@/modules/mail/sync-error";
import { syncMailbox } from "@/modules/mail/sync-mailbox";

const syncSchema = z
  .object({ mailboxId: z.string().min(1) })
  .strict();

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  let mailboxId: string | null = null;
  let configurationVersion: number | null = null;
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
    mailboxId = parsed.data.mailboxId;
    const runtime = await getMailboxRuntimeConfiguration(
      mailboxId
    );
    configurationVersion = runtime.configurationVersion;
    return NextResponse.json(
      await syncMailbox(
        mailboxId,
        createSmtpImapAdapter(runtime.config),
        configurationVersion
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
    const code = classifyMailSyncError(error);
    if (mailboxId && configurationVersion !== null) {
      await prisma.mailbox
        .updateMany({
          where: {
            id: mailboxId,
            configurationVersion,
            encryptedConfig: { not: null },
            configurationDeletedAt: null,
            enabled: true
          },
          data: { lastErrorCode: code }
        })
        .catch(() => undefined);
      console.error("mail_sync_failed", {
        mailboxId,
        stage: "manual_sync",
        code
      });
    }
    return NextResponse.json({ code }, { status: 502 });
  }
}
