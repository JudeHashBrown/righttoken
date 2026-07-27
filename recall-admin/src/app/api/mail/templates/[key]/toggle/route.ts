import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  MailTemplateNotFoundError,
  setMailTemplateEnabled
} from "@/modules/mail/template-service";
import {
  toggleMailTemplateSchema
} from "@/modules/mail/template-schema";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ key: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const [{ member }, { key }] = await Promise.all([
      requireRequestPermission(
        request,
        "mail:manage-templates"
      ),
      context.params
    ]);
    const parsed = toggleMailTemplateSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAIL_TEMPLATE_REQUEST" },
        { status: 400 }
      );
    }
    return NextResponse.json({
      template: await setMailTemplateEnabled({
        actorId: member.id,
        key,
        enabled: parsed.data.enabled
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
      { code: "MAIL_TEMPLATE_TOGGLE_FAILED" },
      { status: 500 }
    );
  }
}
