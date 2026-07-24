import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { smtpImapConfigSchema } from "@/modules/mail/adapters/smtp-imap";
import { saveMailboxCredential } from "@/modules/mail/mailbox-credentials";

const mailboxSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    provider: z.enum(["NAMECHEAP", "WECOM_MAIL", "CUSTOM"]),
    config: smtpImapConfigSchema
  })
  .strict();

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    await requireRequestPermission(request, "integrations:manage");
    const mailboxes = await prisma.mailbox.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        emailAddress: true,
        enabled: true,
        lastTestedAt: true,
        lastSuccessAt: true,
        lastErrorCode: true
      }
    });
    return NextResponse.json({ mailboxes });
  } catch (error) {
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
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "integrations:manage"
    );
    const parsed = mailboxSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAILBOX_CONFIGURATION" },
        { status: 400 }
      );
    }
    const mailbox = await saveMailboxCredential(
      member.id,
      parsed.data
    );
    return NextResponse.json({ mailbox }, { status: 201 });
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
      { code: "MAILBOX_CONFIGURATION_FAILED" },
      { status: 400 }
    );
  }
}
