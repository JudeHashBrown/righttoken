import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  processMailHtml
} from "@/modules/mail/html-policy";
import {
  mailPreviewRequestSchema
} from "@/modules/mail/preview-schema";

function unresolvedVariables(
  subject: string,
  body: string
): string[] {
  return Array.from(
    new Set(
      [
        ...subject.matchAll(/\[[^\[\]\n]{1,80}\]/g),
        ...body.matchAll(/\[[^\[\]\n]{1,80}\]/g)
      ].map((match) => match[0])
    )
  );
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const parsed = mailPreviewRequestSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAIL_PREVIEW_REQUEST" },
        { status: 400 }
      );
    }
    const processed = processMailHtml(parsed.data.bodyHtml);
    const unresolved = unresolvedVariables(
      parsed.data.subject,
      processed.text
    );
    return NextResponse.json({
      ...processed,
      unresolvedVariables: unresolved,
      canSend:
        processed.text.trim().length > 0 &&
        unresolved.length === 0
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
    return NextResponse.json(
      { code: "MAIL_PREVIEW_FAILED" },
      { status: 500 }
    );
  }
}
