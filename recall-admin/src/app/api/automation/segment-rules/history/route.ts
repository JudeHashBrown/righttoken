import { NextRequest, NextResponse } from "next/server";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { listSegmentRuleHistory } from "@/modules/segmentation/rule-history-actions";

export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const { member } = await requireRequestPermission(
      request,
      "users:read"
    );
    return NextResponse.json({
      versions: await listSegmentRuleHistory(member.id)
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
      { code: "SEGMENT_RULE_HISTORY_FAILED" },
      { status: 400 }
    );
  }
}
