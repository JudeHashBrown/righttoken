import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  getMailBatchSummary,
  MailBatchNotFoundError
} from "@/modules/mail/mail-batch-query";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const { id } = await context.params;
    return NextResponse.json(
      await getMailBatchSummary(member, id)
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
    if (error instanceof MailBatchNotFoundError) {
      return NextResponse.json(
        { code: "MAIL_BATCH_NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { code: "MAIL_BATCH_QUERY_FAILED" },
      { status: 400 }
    );
  }
}
