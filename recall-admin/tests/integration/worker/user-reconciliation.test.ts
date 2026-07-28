import "dotenv/config";

import { describe, expect, it, vi } from "vitest";
import type { RightTokenAdapter } from "@/modules/integrations/righttoken/adapter";
import { handleUserReconciliation } from "@/worker/handlers/user-reconciliation";

describe("RightToken reconciliation worker", () => {
  it("skips safely when the data source has not been configured", async () => {
    await expect(
      handleUserReconciliation(
        { mode: "incremental" },
        {
          getAdapter: async () => null,
          readCheckpoint: async () => null,
          saveCheckpoint: async () => undefined
        }
      )
    ).resolves.toEqual({ skipped: "not_configured" });
  });

  it("uses the stored checkpoint for incremental calibration", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      users: [],
      nextCursor: null
    });
    const adapter: RightTokenAdapter = {
      listUsers,
      verifyConnection: vi.fn().mockResolvedValue({
        ok: true,
        source: "test"
      })
    };
    const checkpoint = new Date("2026-07-24T01:00:00.000Z");
    const saveCheckpoint = vi.fn();

    await handleUserReconciliation(
      { mode: "incremental" },
      {
        getAdapter: async () => adapter,
        readCheckpoint: async () => checkpoint,
        saveCheckpoint
      },
      undefined,
      new Date("2026-07-24T02:00:00.000Z")
    );

    expect(listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAfter: checkpoint, limit: 200 })
    );
    expect(saveCheckpoint).toHaveBeenCalledWith(
      new Date("2026-07-24T02:00:00.000Z"),
      expect.objectContaining({ scanned: 0 })
    );
  });

  it("does not advance the checkpoint when pagination is incomplete", async () => {
    const saveCheckpoint = vi.fn();
    const incompleteResult = {
      scanned: 20_000,
      inserted: 20_000,
      updated: 0,
      unchanged: 0,
      isolated: 0,
      segmentChanges: 5_000,
      tasksCreated: 0,
      nextCursor: "more-users"
    };

    await expect(
      handleUserReconciliation(
        { mode: "full" },
        {
          getAdapter: async () => ({
            async listUsers() {
              return { users: [], nextCursor: null };
            },
            async verifyConnection() {
              return { ok: true, source: "test" };
            }
          }),
          readCheckpoint: async () => null,
          reconcile: async () => incompleteResult,
          saveCheckpoint
        }
      )
    ).rejects.toThrow("RIGHTTOKEN_RECONCILIATION_INCOMPLETE");
    expect(saveCheckpoint).not.toHaveBeenCalled();
  });
});
