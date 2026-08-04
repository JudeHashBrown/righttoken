import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  BounceRetryBatchError,
  createBounceRetryBatch
} from "@/modules/mail/create-bounce-retry-batch";
import {
  MailBatchNotFoundError
} from "@/modules/mail/mail-batch-query";
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
    const batch = await createBounceRetryBatch({
      actorId: member.id,
      batchId: id,
      idempotencyKey:
        request.headers.get("idempotency-key") ?? "",
      scheduler: await getRuntimeTaskScheduler()
    });
    return NextResponse.json(
      {
        id: batch.id,
        status: batch.status,
        totalRecipients: batch.totalRecipients,
        pendingRecipients: batch.pendingRecipients
      },
      { status: 201 }
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
    if (error instanceof BounceRetryBatchError) {
      const status =
        error.code === "INVALID_IDEMPOTENCY_KEY" ? 400 : 409;
      return NextResponse.json(
        { code: error.code },
        { status }
      );
    }
    return NextResponse.json(
      { code: "MAIL_BOUNCE_RETRY_FAILED" },
      { status: 400 }
    );
  }
}
