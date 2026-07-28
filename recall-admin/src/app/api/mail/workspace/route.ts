import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  parseMailWorkspaceFilter
} from "@/modules/mail/workspace-filter";
import {
  getMailWorkspaceData
} from "@/modules/mail/workspace-query";

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const filter = parseMailWorkspaceFilter({
      view: request.nextUrl.searchParams.get("view") ?? undefined,
      selected:
        request.nextUrl.searchParams.get("selected") ?? undefined,
      compose:
        request.nextUrl.searchParams.get("compose") ?? undefined,
      userId:
        request.nextUrl.searchParams.get("userId") ?? undefined,
      taskId:
        request.nextUrl.searchParams.get("taskId") ?? undefined
    });
    return NextResponse.json(
      await getMailWorkspaceData(member, filter)
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
      { code: "MAIL_WORKSPACE_FAILED" },
      { status: 500 }
    );
  }
}
