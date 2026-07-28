import type { ReconciliationResult } from "@/modules/integrations/righttoken/reconcile";

export type InitialReconcileSummary = {
  sourceUsersScanned: number;
  destinationUsersBefore: number;
  destinationUsersAfter: number;
  synchronized: number;
  skipped: number;
  isolated: number;
  segmentChanges: number;
  complete: boolean;
};

export function buildInitialReconcileSummary(
  result: ReconciliationResult,
  destinationUsersBefore: number,
  destinationUsersAfter: number
): InitialReconcileSummary {
  return {
    sourceUsersScanned: result.scanned,
    destinationUsersBefore,
    destinationUsersAfter,
    synchronized: result.inserted + result.updated,
    skipped: result.unchanged,
    isolated: result.isolated,
    segmentChanges: result.segmentChanges,
    complete: result.nextCursor === null
  };
}
