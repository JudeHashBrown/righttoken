import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { createSmtpImapAdapter } from "@/modules/mail/adapters/smtp-imap";
import { getMailboxRuntimeConfig } from "@/modules/mail/mailbox-credentials";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  const testedAt = new Date();
  const { id } = await context.params;
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "integrations:manage");
    const config = await getMailboxRuntimeConfig(id);
    await createSmtpImapAdapter(config).testConnection();
    await prisma.mailbox.update({
      where: { id },
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
    await prisma.mailbox
      .update({
        where: { id },
        data: {
          lastTestedAt: testedAt,
          lastErrorCode: "MAILBOX_CONNECTION_FAILED"
        }
      })
      .catch(() => undefined);
    return NextResponse.json(
      { code: "MAILBOX_CONNECTION_FAILED" },
      { status: 502 }
    );
  }
}
