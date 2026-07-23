import { NextRequest, NextResponse } from "next/server";
import { isValidInternalBearer } from "@/modules/integrations/internal-api-auth";
import type { TaskScheduler } from "@/modules/tasks/scheduler";
import type { IngestResult } from "@/modules/users/apply-event";
import { rightTokenEventSchema } from "@/modules/users/event-schema";

export type EventHandlerDependencies = {
  getSecrets(): {
    current: string;
    previous?: string;
  };
  getScheduler(): Promise<TaskScheduler>;
  ingestEvent(
    input: unknown,
    scheduler: TaskScheduler
  ): Promise<IngestResult>;
};

export function createRightTokenEventHandler(
  dependencies: EventHandlerDependencies
) {
  return async function rightTokenEventHandler(
    request: NextRequest
  ): Promise<NextResponse> {
    const secrets = dependencies.getSecrets();
    if (
      !isValidInternalBearer(
        request.headers.get("authorization"),
        secrets.current,
        secrets.previous
      )
    ) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!rightTokenEventSchema.safeParse(body).success) {
      return NextResponse.json(
        { code: "INVALID_EVENT" },
        { status: 400 }
      );
    }

    try {
      const scheduler = await dependencies.getScheduler();
      const result = await dependencies.ingestEvent(body, scheduler);
      return NextResponse.json(result, {
        status: result.duplicate ? 200 : 202
      });
    } catch {
      return NextResponse.json(
        { code: "EVENT_INGESTION_UNAVAILABLE" },
        { status: 503 }
      );
    }
  };
}
