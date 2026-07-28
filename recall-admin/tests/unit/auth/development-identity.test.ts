import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/generated/prisma/client";

const { findFirst } = vi.hoisted(() => ({
  findFirst: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
      findFirst
    }
  }
}));

import {
  DevelopmentIdentityError,
  createDevelopmentSessionContext,
  getDevelopmentPrimaryAdmin
} from "@/modules/auth/development-identity";

const primaryAdmin: Member = {
  id: "primary-admin",
  email: "primary@example.test",
  rightTokenUserId: null,
  displayName: "主管理员",
  passwordHash: "unused",
  role: "PRIMARY_ADMIN",
  active: true,
      twoFactorSecret: null,
      twoFactorOn: false,
      wecomUserId: null,
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z")
};

describe("development identity", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("uses the active primary administrator as the local actor", async () => {
    findFirst.mockResolvedValue(primaryAdmin);

    await expect(getDevelopmentPrimaryAdmin()).resolves.toEqual(
      primaryAdmin
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { role: "PRIMARY_ADMIN", active: true },
      orderBy: { createdAt: "asc" }
    });
  });

  it("fails clearly when the local primary administrator is missing", async () => {
    findFirst.mockResolvedValue(null);

    await expect(getDevelopmentPrimaryAdmin()).rejects.toBeInstanceOf(
      DevelopmentIdentityError
    );
  });

  it("creates a fully verified synthetic session for existing APIs", () => {
    const context = createDevelopmentSessionContext(primaryAdmin);

    expect(context.member).toBe(primaryAdmin);
    expect(context.session.id).toBe("development-session");
    expect(context.session.reauthenticatedAt).toBeInstanceOf(Date);
    expect(context.session.secondFactorRequired).toBe(false);
    expect(context.session.secondFactorVerifiedAt).toBeInstanceOf(Date);
  });
});
