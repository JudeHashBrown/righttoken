import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { previewSegmentRuleSet } from "@/modules/segmentation/preview-rule-set";

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
    } | null;
    const preview = await previewSegmentRuleSet(
      member.id,
      body?.draft
    );
    await prisma.auditLog.create({
      data: {
        actorId: member.id,
        action: "segment_rule.previewed",
        entityType: "AutomationRuleVersion",
        metadata: {
          draftHash: preview.draftHash,
          totalUsers: preview.totalUsers,
          migrations: preview.migrations,
          overlapUsers: preview.overlapUsers,
          tasksToCancel: preview.tasksToCancel,
          tasksToCreate: preview.tasksToCreate
        }
      }
    });
    return NextResponse.json(preview);
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
      { code: "INVALID_SEGMENT_RULE_PREVIEW" },
      { status: 400 }
    );
  }
}
