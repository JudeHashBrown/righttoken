import { NextRequest, NextResponse } from "next/server";
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const testedAt = new Date();
  const { id } = await context.params;
  let configurationVersion: number | null = null;
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "integrations:manage");
    const runtime = await getMailboxRuntimeConfiguration(id);
    configurationVersion = runtime.configurationVersion;
    await createSmtpImapAdapter(runtime.config).testConnection();
    await prisma.mailbox.updateMany({
      where: {
        id,
        configurationVersion,
        encryptedConfig: { not: null },
        configurationDeletedAt: null
      },
      data: {
        lastTestedAt: testedAt,
        lastSuccessAt: testedAt,
        lastErrorCode: null
      }
    });
    return NextResponse.json({ ok: true, testedAt });
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      error instanceof ForbiddenError
    ) {
      return NextResponse.json(
        {
          code:
            error instanceof UnauthorizedError
              ? "UNAUTHORIZED"
              : "FORBIDDEN"
        },
        { status: error instanceof UnauthorizedError ? 401 : 403 }
      );
    }
    const code = classifyMailSyncError(error);
    if (configurationVersion !== null) {
      await prisma.mailbox
        .updateMany({
          where: {
            id,
            configurationVersion,
            encryptedConfig: { not: null },
            configurationDeletedAt: null
          },
          data: {
            lastTestedAt: testedAt,
            lastErrorCode: code
          }
        })
        .catch(() => undefined);
    }
    console.error("mailbox_connection_test_failed", {
      mailboxId: id,
      stage: "connection_test",
      code
    });
    return NextResponse.json(
      { code },
      { status: 502 }
    );
  }
}
