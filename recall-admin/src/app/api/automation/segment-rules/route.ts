import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { publishAutomationRuleVersion } from "@/modules/automation/rule-version";
import { segmentConfigSchema } from "@/modules/segmentation/rule-config";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "rules:publish"
    );
    const parsed = segmentConfigSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_SEGMENT_RULE" },
        { status: 400 }
      );
    }

    const published = await publishAutomationRuleVersion(
      member.id,
      "segmentation",
      parsed.data
    );
    return NextResponse.json({
      id: published.id,
      version: published.version
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
