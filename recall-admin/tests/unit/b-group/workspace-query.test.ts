import { describe, expect, it } from "vitest";
import {
  bGroupOrderBy,
  buildBGroupWhere
} from "@/modules/b-group/workspace-query";

describe("B-group workspace query", () => {
  it("filters current B users by email or registration sequence", () => {
    expect(
      buildBGroupWhere(
        { id: "operator-1", role: "OPERATOR" },
        " 10428 "
      )
    ).toEqual({
      AND: [
        { sourceDeletedAt: null, currentSegment: "B" },
        {
          OR: [
            { ownerId: "operator-1" },
            {
              tasks: {
                some: {
                  OR: [
                    { assigneeId: "operator-1" },
                    { assigneeId: null, status: "UNASSIGNED" }
                  ]
                }
              }
            }
          ]
        },
        {
          OR: [
            {
              externalUserId: {
                contains: "10428",
                mode: "insensitive"
              }
            },
            {
              email: {
                contains: "10428",
                mode: "insensitive"
              }
            }
          ]
        }
      ]
    });
  });

  it("sorts recent checkout first with nulls last", () => {
    expect(bGroupOrderBy()).toEqual([
      { checkoutStartedAt: { sort: "desc", nulls: "last" } },
      { registeredAt: "desc" },
      { id: "desc" }
    ]);
  });
});
