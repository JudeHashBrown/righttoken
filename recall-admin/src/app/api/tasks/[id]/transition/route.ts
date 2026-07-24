import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  cancelTask,
  claimTask,
  completeTask,
  InvalidTaskTransitionError,
  pauseTask,
  resumeTask,
  startTask,
  waitForUser
} from "@/modules/tasks/task-service";

const transitionSchema = z
  .object({
    action: z.enum([
      "claim",
      "start",
      "wait_user",
      "complete",
      "pause",
      "resume",
      "cancel"
    ]),
    reason: z.string().trim().min(1).max(500).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === "cancel" && !value.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "取消任务时必须填写原因"
      });
    }
  });

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
    const parsed = transitionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_TASK_TRANSITION" },
        { status: 400 }
      );
    }
    const { id } = await context.params;
    const { action, reason } = parsed.data;
    const task =
      action === "claim"
        ? await claimTask(id, member.id)
        : action === "start"
          ? await startTask(id, member.id)
          : action === "wait_user"
            ? await waitForUser(id, member.id)
            : action === "complete"
              ? await completeTask(id, member.id)
              : action === "pause"
                ? await pauseTask(id, member.id)
                : action === "resume"
                  ? await resumeTask(id, member.id)
                  : await cancelTask(id, member.id, reason!);

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
    if (error instanceof InvalidTaskTransitionError) {
      return NextResponse.json(
        { code: "INVALID_TASK_TRANSITION" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { code: "TASK_TRANSITION_FAILED" },
      { status: 400 }
    );
  }
}
