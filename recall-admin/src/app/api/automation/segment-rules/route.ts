import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { publishSegmentRuleSet } from "@/modules/segmentation/publish-rule-set";
import { getRuntimeTaskScheduler } from "@/modules/tasks/runtime-scheduler";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "rules:publish"
    );
    const body = (await request.json().catch(() => null)) as {
      draft?: unknown;
      previewToken?: string;
      changeSummary?: string;
    } | null;
    const idempotencyKey = request.headers.get("idempotency-key");
    if (
      !body ||
      typeof body.previewToken !== "string" ||
      typeof body.changeSummary !== "string" ||
      !idempotencyKey
    ) {
      return NextResponse.json(
        { code: "INVALID_SEGMENT_RULE" },
        { status: 400 }
      );
    }

    const draft =
      body.draft && typeof body.draft === "object"
        ? {
            ...(body.draft as Record<string, unknown>),
            changeSummary: body.changeSummary
          }
        : body.draft;
    const published = await publishSegmentRuleSet({
      actorId: member.id,
      draft,
      previewToken: body.previewToken,
      idempotencyKey,
      scheduler: await getRuntimeTaskScheduler()
    });
    return NextResponse.json({
      id: published.ruleVersion.id,
      version: published.ruleVersion.version,
      runId: published.run.id,
      status: published.run.status
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
      { code: "SEGMENT_RULE_REJECTED" },
      { status: 400 }
    );
  }
}
