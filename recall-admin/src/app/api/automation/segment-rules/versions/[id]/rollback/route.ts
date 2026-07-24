import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { rollbackSegmentRuleVersion } from "@/modules/segmentation/rule-history-actions";
import { getRuntimeTaskScheduler } from "@/modules/tasks/runtime-scheduler";

const rollbackSchema = z
  .object({
    changeSummary: z.string().trim().min(4).max(500)
  })
  .strict();

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
    const parsed = rollbackSchema.safeParse(
      await request.json().catch(() => null)
    );
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!parsed.success || !idempotencyKey) {
      return NextResponse.json(
        { code: "INVALID_SEGMENT_RULE_ROLLBACK" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const result = await rollbackSegmentRuleVersion({
      actorId: member.id,
      targetVersionId: id,
      changeSummary: parsed.data.changeSummary,
      idempotencyKey,
      scheduler: await getRuntimeTaskScheduler()
    });
    return NextResponse.json({
      id: result.ruleVersion.id,
      version: result.ruleVersion.version,
      runId: result.run.id,
      status: result.run.status
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
      { code: "SEGMENT_RULE_ROLLBACK_FAILED" },
      { status: 400 }
    );
  }
}
