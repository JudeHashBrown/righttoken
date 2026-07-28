import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    await requireRequestPermission(request, "users:read");
    const { id } = await context.params;
    const run = await prisma.segmentRecalculationRun.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        status: true,
        totalUsers: true,
        processedUsers: true,
        succeededUsers: true,
        failedUsers: true,
        segmentChanges: true,
        cancelledTasks: true,
        createdTasks: true,
        startedAt: true,
        completedAt: true
      }
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
      { code: "SEGMENT_RECALCULATION_NOT_FOUND" },
      { status: 404 }
    );
  }
}
