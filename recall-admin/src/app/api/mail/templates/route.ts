import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  createMailTemplate,
  listActiveMailTemplates,
  MailTemplateAssetError
} from "@/modules/mail/template-service";
import {
  createMailTemplateSchema
} from "@/modules/mail/template-schema";

function authErrorResponse(error: unknown): NextResponse | null {
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
  if (error instanceof MailTemplateAssetError) {
    return NextResponse.json(
      { code: error.code },
      { status: 400 }
    );
  }
  return null;
}
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    await requireRequestPermission(
      request,
      "mail:manage-templates"
    );
    return NextResponse.json({
      templates: await listActiveMailTemplates()
    });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        { code: "MAIL_TEMPLATE_LIST_FAILED" },
        { status: 500 }
      )
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
      "mail:manage-templates"
    );
    const parsed = createMailTemplateSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAIL_TEMPLATE_REQUEST" },
        { status: 400 }
      );
    }
    const template = await createMailTemplate({
      actorId: member.id,
      ...parsed.data
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json(
        { code: "MAIL_TEMPLATE_CREATE_FAILED" },
        { status: 500 }
      )
    );
  }
}
