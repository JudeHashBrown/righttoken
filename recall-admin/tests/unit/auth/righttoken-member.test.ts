import { describe, expect, it } from "vitest";
import type { Member } from "@/generated/prisma/client";
import type { RightTokenIdentity } from "@/modules/auth/righttoken-ticket";
import {
  redeemRightTokenJti,
  resolveRightTokenMember,
  type RightTokenMemberStore
} from "@/modules/auth/righttoken-member";

const identity: RightTokenIdentity = {
  rightTokenUserId: "rt-42",
  email: "operator@example.com",
  displayName: "运营一号",
  jti: "ticket-1234567890abcdef",
  issuedAt: new Date("2026-07-26T12:00:00.000Z"),
  expiresAt: new Date("2026-07-26T12:01:00.000Z")
};

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "member-1",
    email: "operator@example.com",
    displayName: "运营一号",
    passwordHash: "unused",
    role: "OPERATOR",
    active: true,
    twoFactorSecret: null,
    twoFactorOn: false,
    wecomUserId: null,
    rightTokenUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

class MemoryStore implements RightTokenMemberStore {
  byExternalId: Member | null = null;
  byEmail: Member | null = null;
  bound: Array<{ memberId: string; rightTokenUserId: string }> = [];
  redeemed = new Set<string>();

  async findByRightTokenUserId(): Promise<Member | null> {
    return this.byExternalId;
  }

  async findByEmail(): Promise<Member | null> {
    return this.byEmail;
  }

  async bindRightTokenUserId(
    memberId: string,
    rightTokenUserId: string
  ): Promise<Member> {
    this.bound.push({ memberId, rightTokenUserId });
    return member({ id: memberId, rightTokenUserId });
  }

  async redeemJti(jti: string): Promise<boolean> {
    if (this.redeemed.has(jti)) return false;
    this.redeemed.add(jti);
    return true;
  }
}

describe("resolveRightTokenMember", () => {
  it("returns an active member already bound to the subject", async () => {
    const store = new MemoryStore();
    store.byExternalId = member({
      rightTokenUserId: identity.rightTokenUserId
    });

    await expect(
      resolveRightTokenMember(identity, store)
    ).resolves.toMatchObject({
      id: "member-1",
      role: "OPERATOR"
    });
    expect(store.bound).toEqual([]);
  });

  it("binds an unbound active member by normalized email", async () => {
    const store = new MemoryStore();
    store.byEmail = member({ email: "Operator@Example.com" });

    const result = await resolveRightTokenMember(identity, store);

    expect(result?.rightTokenUserId).toBe("rt-42");
    expect(store.bound).toEqual([
      { memberId: "member-1", rightTokenUserId: "rt-42" }
    ]);
  });

  it("denies unknown, inactive, and conflicting members", async () => {
    const unknown = new MemoryStore();
    await expect(
      resolveRightTokenMember(identity, unknown)
    ).resolves.toBeNull();

    const inactive = new MemoryStore();
    inactive.byExternalId = member({
      active: false,
      rightTokenUserId: "rt-42"
    });
    await expect(
      resolveRightTokenMember(identity, inactive)
    ).resolves.toBeNull();

    const conflicting = new MemoryStore();
    conflicting.byEmail = member({
      rightTokenUserId: "rt-another-user"
    });
    await expect(
      resolveRightTokenMember(identity, conflicting)
    ).resolves.toBeNull();
  });
});

describe("redeemRightTokenJti", () => {
  it("allows a jti only once", async () => {
    const store = new MemoryStore();

    await expect(
      redeemRightTokenJti(identity, store)
    ).resolves.toBe(true);
    await expect(
      redeemRightTokenJti(identity, store)
    ).resolves.toBe(false);
  });
});
