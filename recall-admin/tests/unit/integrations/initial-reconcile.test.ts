import { describe, expect, it } from "vitest";
import { buildInitialReconcileSummary } from "@/modules/integrations/righttoken/initial-reconcile";

describe("buildInitialReconcileSummary", () => {
  it("reports source, destination, success, skipped, and isolated counts", () => {
    expect(
      buildInitialReconcileSummary(
        {
          scanned: 100,
          inserted: 80,
          updated: 10,
          unchanged: 7,
          isolated: 3,
          segmentChanges: 25,
          tasksCreated: 0,
          nextCursor: null
        },
        2,
        92
      )
    ).toEqual({
      sourceUsersScanned: 100,
      destinationUsersBefore: 2,
      destinationUsersAfter: 92,
      synchronized: 90,
      skipped: 7,
      isolated: 3,
      segmentChanges: 25,
      complete: true
    });
  });

  it("marks a capped import incomplete when a cursor remains", () => {
    const summary = buildInitialReconcileSummary(
      {
        scanned: 20_000,
        inserted: 19_000,
        updated: 0,
        unchanged: 1_000,
        isolated: 0,
        segmentChanges: 5_000,
        tasksCreated: 0,
        nextCursor: "more-users"
      },
      0,
      19_000
    );

    expect(summary.complete).toBe(false);
  });
});
