import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { getRuntimeTaskScheduler } from "@/modules/tasks/runtime-scheduler";
import { handleUserReconciliation } from "@/worker/handlers/user-reconciliation";

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    await requireRequestPermission(request, "integrations:manage");
    const body = (await request.json().catch(() => null)) as {
      mode?: unknown;
    } | null;
    const mode = body?.mode === "full" ? "full" : "incremental";
    const result = await handleUserReconciliation(
      { mode },
      undefined,
      await getRuntimeTaskScheduler()
    );
    return NextResponse.json(result);
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
      { code: "RIGHTTOKEN_SYNC_FAILED" },
      { status: 503 }
    );
  }
}
