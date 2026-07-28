import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { retrySegmentRecalculation } from "@/modules/segmentation/rule-history-actions";
import { getRuntimeTaskScheduler } from "@/modules/tasks/runtime-scheduler";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "rules:publish"
    );
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return NextResponse.json(
        { code: "IDEMPOTENCY_KEY_REQUIRED" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const run = await retrySegmentRecalculation({
      actorId: member.id,
      runId: id,
      idempotencyKey,
      scheduler: await getRuntimeTaskScheduler()
    });
    return NextResponse.json({ run });
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
      { code: "SEGMENT_RECALCULATION_RETRY_FAILED" },
      { status: 400 }
    );
  }
}
