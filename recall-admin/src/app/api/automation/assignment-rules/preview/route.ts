import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { assignmentRuleInputSchema } from "@/modules/assignment/match-rule";
import { previewRules } from "@/modules/assignment/preview-rules";

const previewSchema = z
  .object({
    rules: z.array(assignmentRuleInputSchema).max(100)
  })
  .strict();

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "rules:publish");
    const parsed = previewSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_ASSIGNMENT_PREVIEW" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await previewRules(parsed.data.rules)
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
    return NextResponse.json(
      { code: "ASSIGNMENT_PREVIEW_REJECTED" },
      { status: 400 }
    );
  }
}
