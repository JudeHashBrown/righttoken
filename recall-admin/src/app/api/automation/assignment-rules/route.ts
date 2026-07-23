import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { assignmentRuleInputSchema } from "@/modules/assignment/match-rule";
import { publishAssignmentRules } from "@/modules/assignment/publish-rules";

const rulesetSchema = z
  .object({
    rules: z.array(assignmentRuleInputSchema).max(100)
  })
  .strict();

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    await requireRequestPermission(request, "rules:publish");
    const rules = await prisma.assignmentRule.findMany({
      orderBy: { priority: "asc" }
    });
    return NextResponse.json({ rules });
  } catch (error) {
    return NextResponse.json(
      {
        code:
          error instanceof UnauthorizedError
            ? "UNAUTHORIZED"
            : "FORBIDDEN"
      },
      {
        status: error instanceof UnauthorizedError ? 401 : 403
      }
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
      "rules:publish"
    );
    const parsed = rulesetSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_ASSIGNMENT_RULESET" },
        { status: 400 }
      );
    }
    const published = await publishAssignmentRules(
      member.id,
      parsed.data.rules
    );
    return NextResponse.json({ published });
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
      { code: "ASSIGNMENT_RULESET_REJECTED" },
      { status: 400 }
    );
  }
}
