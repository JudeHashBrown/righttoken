import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  mailAudienceQuerySchema
} from "@/modules/mail/batch-schema";
import {
  previewMailAudience
} from "@/modules/mail/mail-audience";

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const parsed = mailAudienceQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MAIL_AUDIENCE" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await previewMailAudience(member, parsed.data)
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
      { code: "MAIL_AUDIENCE_PREVIEW_FAILED" },
      { status: 400 }
    );
  }
}
