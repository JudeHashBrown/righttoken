import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  archiveMailTemplateVersion,
  MailTemplateNotFoundError
} from "@/modules/mail/template-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const [{ member }, { id }] = await Promise.all([
      requireRequestPermission(
        request,
        "mail:archive-template-version"
      ),
      context.params
    ]);
    return NextResponse.json({
      template: await archiveMailTemplateVersion({
        actorId: member.id,
        templateId: id
      })
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
    if (error instanceof MailTemplateNotFoundError) {
      return NextResponse.json(
        { code: "MAIL_TEMPLATE_NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { code: "MAIL_TEMPLATE_ARCHIVE_FAILED" },
      { status: 500 }
    );
  }
}
