import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { RightTokenAdapter } from "@/modules/integrations/righttoken/adapter";
import { reconcileRightTokenUsers } from "@/modules/integrations/righttoken/reconcile";
import { getConfiguredRightTokenAdapter } from "@/modules/integrations/righttoken/runtime-adapter";
import {
  noopTaskScheduler,
  type TaskScheduler
} from "@/modules/tasks/scheduler";

const inputSchema = z.object({
  mode: z.enum(["incremental", "full"]).default("incremental")
});

type Dependencies = {
  getAdapter(): Promise<RightTokenAdapter | null>;
  readCheckpoint(): Promise<Date | null>;
  reconcile?: typeof reconcileRightTokenUsers;
  saveCheckpoint(
    checkpoint: Date,
    result: Awaited<ReturnType<typeof reconcileRightTokenUsers>>
  ): Promise<void>;
};

const dependencies: Dependencies = {
  getAdapter: getConfiguredRightTokenAdapter,
  async readCheckpoint() {
    const credential = await prisma.integrationCredential.findUnique({
      where: { kind: "RIGHTTOKEN_SOURCE" },
      select: { metadata: true }
    });
    const metadata = credential?.metadata;
    if (
      !metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata)
    ) {
      return null;
    }
    const value = (metadata as Record<string, unknown>)
      .lastReconciledAt;
    if (typeof value !== "string") {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  async saveCheckpoint(checkpoint, result) {
    const credential = await prisma.integrationCredential.findUnique({
      where: { kind: "RIGHTTOKEN_SOURCE" },
      select: { metadata: true }
    });
    const oldMetadata =
      credential?.metadata &&
      typeof credential.metadata === "object" &&
      !Array.isArray(credential.metadata)
        ? (credential.metadata as Prisma.JsonObject)
        : {};
    await prisma.integrationCredential.update({
      where: { kind: "RIGHTTOKEN_SOURCE" },
      data: {
        lastSuccessAt: checkpoint,
        lastErrorCode: null,
        metadata: {
          ...oldMetadata,
          lastReconciledAt: checkpoint.toISOString(),
          lastResult: {
            scanned: result.scanned,
            inserted: result.inserted,
            updated: result.updated,
            unchanged: result.unchanged,
            isolated: result.isolated,
            segmentChanges: result.segmentChanges
          }
        }
      }
    });
  }
};

export async function handleUserReconciliation(
  rawInput: unknown = { mode: "incremental" },
  deps: Dependencies = dependencies,
  scheduler: TaskScheduler = noopTaskScheduler,
  now = new Date()
) {
  const input = inputSchema.parse(rawInput);
  const adapter = await deps.getAdapter();
  if (!adapter) {
    return { skipped: "not_configured" as const };
  }
  const updatedAfter =
    input.mode === "incremental"
      ? await deps.readCheckpoint()
      : null;
  try {
    const reconcile = deps.reconcile ?? reconcileRightTokenUsers;
    const result = await reconcile({
      adapter,
      scheduler,
      updatedAfter: updatedAfter ?? undefined,
      maxPages: 10_000,
      now
    });
    if (result.nextCursor) {
      throw new Error(
        "RIGHTTOKEN_RECONCILIATION_INCOMPLETE"
      );
    }
    await deps.saveCheckpoint(now, result);
    return { mode: input.mode, ...result };
  } catch (error) {
    await prisma.integrationCredential
      .update({
        where: { kind: "RIGHTTOKEN_SOURCE" },
        data: {
          lastErrorCode:
            error instanceof Error
              ? error.message.slice(0, 120)
              : "RIGHTTOKEN_RECONCILIATION_FAILED"
        }
      })
      .catch(() => undefined);
    throw error;
  }
}
