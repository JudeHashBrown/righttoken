import { describe, expect, it } from "vitest";
import {
  aGroupOrderBy,
  buildAGroupWhere
} from "@/modules/a-group/workspace-query";

describe("A-group workspace query", () => {
  it("filters current A users who have not started checkout", () => {
    expect(
      buildAGroupWhere(
        { id: "operator-1", role: "OPERATOR" },
        " 10428 "
      )
    ).toEqual({
      AND: [
        {
          sourceDeletedAt: null,
          currentSegment: "A",
          checkoutStartedAt: null
        },
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

  it("sorts newest registrations first", () => {
    expect(aGroupOrderBy()).toEqual([
      { registeredAt: "desc" },
      { id: "desc" }
    ]);
  });
});
