import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  MailBatchNotFoundError
} from "@/modules/mail/mail-batch-query";
import {
  retryMailBatch
} from "@/modules/mail/retry-mail-batch";
import {
  getRuntimeTaskScheduler
} from "@/modules/tasks/runtime-scheduler";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    const { id } = await context.params;
    const batch = await retryMailBatch({
      actorId: member.id,
      batchId: id,
      scheduler: await getRuntimeTaskScheduler()
    });
    return NextResponse.json({
      id: batch.id,
      status: batch.status,
      pendingRecipients: batch.pendingRecipients,
      sentRecipients: batch.sentRecipients,
      skippedRecipients: batch.skippedRecipients,
      failedRecipients: batch.failedRecipients
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
    if (error instanceof MailBatchNotFoundError) {
      return NextResponse.json(
        { code: "MAIL_BATCH_NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { code: "MAIL_BATCH_RETRY_FAILED" },
      { status: 400 }
    );
  }
}
