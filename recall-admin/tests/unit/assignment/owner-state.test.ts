import { describe, expect, it } from "vitest";
import { isManualOwnerLocked } from "@/modules/assignment/owner-state";

describe("owner assignment state", () => {
  it("locks only a manual assignment with a valid owner", () => {
    expect(
      isManualOwnerLocked({
        ownerAssignmentMode: "MANUAL",
        ownerId: "operator-1"
      })
    ).toBe(true);
    expect(
      isManualOwnerLocked({
        ownerAssignmentMode: "AUTO",
        ownerId: "operator-1"
      })
    ).toBe(false);
    expect(
      isManualOwnerLocked({
        ownerAssignmentMode: "MANUAL",
        ownerId: null
      })
    ).toBe(false);
  });
});
