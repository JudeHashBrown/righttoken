import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  mailBatchRequestSchema
} from "@/modules/mail/batch-schema";
import {
  createMailBatch,
  MailBatchCreationError
} from "@/modules/mail/create-mail-batch";
import {
  OutboundMailAssetError
} from "@/modules/mail/outbound-assets";
import {
  getRuntimeTaskScheduler
} from "@/modules/tasks/runtime-scheduler";
import {
  listMailBatches
} from "@/modules/mail/mail-batch-query";

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const { member } = await requireRequestPermission(
      request,
      "mail:send-reviewed"
    );
    return NextResponse.json({
      batches: await listMailBatches(member)
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
      { code: "MAIL_BATCH_LIST_FAILED" },
      { status: 400 }
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
      "mail:send-reviewed"
    );
    const parsed = mailBatchRequestSchema.safeParse(
      await request.json().catch(() => null)
    );
    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() ?? "";
    if (!parsed.success || !idempotencyKey) {
      return NextResponse.json(
        { code: "INVALID_MAIL_BATCH_REQUEST" },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const batch = await createMailBatch({
      actorId: member.id,
      mailboxId: data.mailboxId,
      audience:
        data.mode === "SEGMENT"
          ? {
              mode: "SEGMENT",
              segment: data.segment
            }
          : { mode: "ALL" },
      subject: data.subject,
      bodyText: data.bodyText,
      bodyHtml: data.bodyHtml,
      assets: data.assets,
      idempotencyKey,
      scheduler: await getRuntimeTaskScheduler()
    });
    return NextResponse.json(
      {
        id: batch.id,
        status: batch.status,
        totalRecipients: batch.totalRecipients,
        pendingRecipients: batch.pendingRecipients,
        sentRecipients: batch.sentRecipients,
        skippedRecipients: batch.skippedRecipients,
        failedRecipients: batch.failedRecipients
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
    if (error instanceof MailBatchCreationError) {
      return NextResponse.json(
        { code: error.code },
        {
          status:
            error.code === "INVALID_IDEMPOTENCY_KEY"
              ? 400
              : 409
        }
      );
    }
    if (error instanceof OutboundMailAssetError) {
      return NextResponse.json(
        { code: error.code },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { code: "MAIL_BATCH_CREATE_FAILED" },
      { status: 502 }
    );
  }
}
