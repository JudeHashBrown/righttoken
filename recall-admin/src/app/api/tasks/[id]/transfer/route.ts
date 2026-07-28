import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { transferTask } from "@/modules/tasks/task-service";

const transferSchema = z
  .object({
    assigneeId: z.string().min(1),
    reason: z.string().trim().min(1).max(500)
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
      "tasks:work"
    );
    const parsed = transferSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_TASK_TRANSFER" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const task = await transferTask(
      id,
      member.id,
      parsed.data.assigneeId,
      parsed.data.reason
    );
    return NextResponse.json({ task });
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
      { code: "TASK_TRANSFER_FAILED" },
      { status: 400 }
    );
  }
}
