import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { publishAutomationRuleVersion } from "@/modules/automation/rule-version";
import { notificationPolicySchema } from "@/modules/notifications/policy-config";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "rules:publish"
    );
    const parsed = notificationPolicySchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_NOTIFICATION_POLICY" },
        { status: 400 }
      );
    }

    const published = await publishAutomationRuleVersion(
      member.id,
      "notifications",
      parsed.data,
      notificationPolicySchema
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
      { code: "NOTIFICATION_POLICY_REJECTED" },
      { status: 400 }
    );
  }
}
