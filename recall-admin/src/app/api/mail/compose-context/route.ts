import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  findComposeUsers,
  getComposeContext
} from "@/modules/mail/compose-context";

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const query = request.nextUrl.searchParams
      .get("query")
      ?.slice(0, 200) ?? "";
    const userId =
      request.nextUrl.searchParams.get("userId");
    const taskId =
      request.nextUrl.searchParams.get("taskId");
    if (userId || taskId) {
      return NextResponse.json(
        await getComposeContext(member, {
          userId,
          taskId
        })
      );
    }
    return NextResponse.json({
      users: await findComposeUsers(member, query)
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
      { code: "MAIL_COMPOSE_CONTEXT_FAILED" },
      { status: 400 }
    );
  }
}
