import { describe, expect, it } from "vitest";
import type { Member } from "@/generated/prisma/client";
import {
  ForbiddenError,
  assertMemberPermission
} from "@/modules/auth/guards";

function memberWithRole(
  role: Member["role"]
): Pick<Member, "id" | "role"> {
  return { id: "member-test", role };
}

describe("server authorization guard", () => {
  it("returns the authorized member", () => {
    const member = memberWithRole("PRIMARY_ADMIN");

    expect(
      assertMemberPermission(member, "users:export")
    ).toBe(member);
  });

  it("throws for a role without the requested permission", () => {
    expect(() =>
      assertMemberPermission(
        memberWithRole("ADMIN"),
        "users:export"
      )
    ).toThrow(ForbiddenError);
  });
});
