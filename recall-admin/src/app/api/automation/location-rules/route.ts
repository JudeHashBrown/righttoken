import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  publishLocationRules
} from "@/modules/location/rule-service";
import { locationRuleInputSchema } from "@/modules/location/rule-schema";
import { getRuntimeTaskScheduler } from "@/modules/tasks/runtime-scheduler";

const requestSchema = z
  .object({
    rules: z.array(locationRuleInputSchema).min(1).max(500)
  })
  .strict();

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    await requireRequestPermission(request, "rules:publish");
    return NextResponse.json({
      rules: await prisma.locationAttributionRule.findMany({
        orderBy: { priority: "asc" }
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        code:
          error instanceof UnauthorizedError
            ? "UNAUTHORIZED"
            : "FORBIDDEN"
      },
      { status: error instanceof UnauthorizedError ? 401 : 403 }
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
      "location-rules:publish"
    );
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_LOCATION_RULESET" },
        { status: 400 }
      );
    }
    const result = await publishLocationRules(
      member.id,
      parsed.data.rules,
      await getRuntimeTaskScheduler()
    );
    return NextResponse.json({
      published: result.published,
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
      { code: "LOCATION_RULESET_REJECTED" },
      { status: 400 }
    );
  }
}
