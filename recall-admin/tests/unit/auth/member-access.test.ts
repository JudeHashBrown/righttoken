import { describe, expect, it } from "vitest";
import type { MemberRole } from "@/generated/prisma/client";
import {
  MemberAccessError,
  grantMemberAccess,
  revokeMemberAccess,
  type MemberAccessRecord,
  type MemberAccessStore
} from "@/modules/auth/member-access";

function member(
  input: Partial<MemberAccessRecord> & Pick<MemberAccessRecord, "id">
): MemberAccessRecord {
  return {
    email: `${input.id}@example.test`,
    displayName: input.id,
    role: "OPERATOR",
    active: true,
    rightTokenUserId: input.id,
    ...input
  };
}

class FakeMemberAccessStore implements MemberAccessStore {
  members = new Map<string, MemberAccessRecord>();
  registeredUsers = new Map<
    string,
    {
      externalUserId: string;
      email: string;
      displayName: string | null;
    }
  >();
  lastGrant:
    | {
        actorId: string;
        registeredUserId: string;
        email: string;
        displayName: string;
        role: Exclude<MemberRole, "PRIMARY_ADMIN">;
      }
    | undefined;
  lastRevocation:
    | {
        actorId: string;
        targetId: string;
        successorId: string;
      }
    | undefined;

  async findMember(id: string) {
    return this.members.get(id) ?? null;
  }

  async findMemberByEmail(email: string) {
    return (
      [...this.members.values()].find(
        (item) => item.email === email
      ) ?? null
    );
  }

  async findRegisteredUser(email: string) {
    return this.registeredUsers.get(email) ?? null;
  }

  async grantAccess(input: {
    actorId: string;
    registeredUserId: string;
    email: string;
    displayName: string;
    role: Exclude<MemberRole, "PRIMARY_ADMIN">;
  }) {
    this.lastGrant = input;
    const existing = [...this.members.values()].find(
      (item) => item.email === input.email
    );
    const granted = member({
      id: existing?.id ?? "granted-member",
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      active: true,
      rightTokenUserId: input.registeredUserId
    });
    this.members.set(granted.id, granted);
    return granted;
  }

  async revokeAccess(input: {
    actorId: string;
    targetId: string;
    successorId: string;
  }) {
    this.lastRevocation = input;
    const target = this.members.get(input.targetId)!;
    this.members.set(input.targetId, { ...target, active: false });
    return {
      member: { ...target, active: false },
      revokedSessions: 2,
      reassignedUsers: 3,
      transferredTasks: 4,
      failedUsers: 0,
      successor: {
        id: input.successorId,
        displayName:
          this.members.get(input.successorId)?.displayName ??
          input.successorId,
        email:
          this.members.get(input.successorId)?.email ??
          `${input.successorId}@example.test`
      }
    };
  }
}

describe("member access", () => {
  it("only grants access to a synchronized RightToken user", async () => {
    const store = new FakeMemberAccessStore();
    store.members.set(
      "primary",
      member({ id: "primary", role: "PRIMARY_ADMIN" })
    );

    await expect(
      grantMemberAccess(
        "primary",
        "missing@example.test",
        "OPERATOR",
        store
      )
    ).rejects.toMatchObject({ code: "RIGHTTOKEN_USER_NOT_FOUND" });
  });

  it("binds an authorized member to the synchronized main-site user", async () => {
    const store = new FakeMemberAccessStore();
    store.members.set(
      "primary",
      member({ id: "primary", role: "PRIMARY_ADMIN" })
    );
    store.registeredUsers.set("user@example.test", {
      externalUserId: "righttoken-user-9",
      email: "user@example.test",
      displayName: "Main User"
    });

    const result = await grantMemberAccess(
      "primary",
      " USER@example.test ",
      "ADMIN",
      store
    );

    expect(result).toMatchObject({
      rightTokenUserId: "righttoken-user-9",
      displayName: "Main User",
      role: "ADMIN",
      active: true
    });
  });

  it("allows administrators to grant operator access only", async () => {
    const store = new FakeMemberAccessStore();
    store.members.set(
      "admin",
      member({ id: "admin", role: "ADMIN" })
    );
    store.registeredUsers.set("user@example.test", {
      externalUserId: "righttoken-user-9",
      email: "user@example.test",
      displayName: null
    });

    await expect(
      grantMemberAccess(
        "admin",
        "user@example.test",
        "ADMIN",
        store
      )
    ).rejects.toBeInstanceOf(MemberAccessError);
    await expect(
      grantMemberAccess(
        "admin",
        "user@example.test",
        "OPERATOR",
        store
      )
    ).resolves.toMatchObject({ role: "OPERATOR" });
  });

  it("protects the primary administrator and the acting member", async () => {
    const store = new FakeMemberAccessStore();
    store.members.set(
      "primary",
      member({ id: "primary", role: "PRIMARY_ADMIN" })
    );
    store.members.set(
      "admin",
      member({ id: "admin", role: "ADMIN" })
    );

    await expect(
      revokeMemberAccess("primary", "primary", "admin", store)
    ).rejects.toMatchObject({ code: "CANNOT_REVOKE_SELF" });
    await expect(
      revokeMemberAccess("admin", "primary", "admin", store)
    ).rejects.toMatchObject({ code: "CANNOT_REVOKE_PRIMARY_ADMIN" });
  });

  it("requires an active successor different from the revoked member", async () => {
    const store = new FakeMemberAccessStore();
    store.members.set(
      "primary",
      member({ id: "primary", role: "PRIMARY_ADMIN" })
    );
    store.members.set(
      "operator",
      member({ id: "operator", role: "OPERATOR" })
    );
    store.members.set(
      "inactive",
      member({ id: "inactive", active: false })
    );

    await expect(
      revokeMemberAccess("primary", "operator", "", store)
    ).rejects.toMatchObject({ code: "SUCCESSOR_REQUIRED" });
    await expect(
      revokeMemberAccess("primary", "operator", "missing", store)
    ).rejects.toMatchObject({ code: "SUCCESSOR_NOT_FOUND" });
    await expect(
      revokeMemberAccess("primary", "operator", "inactive", store)
    ).rejects.toMatchObject({ code: "SUCCESSOR_INACTIVE" });
    await expect(
      revokeMemberAccess("primary", "operator", "operator", store)
    ).rejects.toMatchObject({
      code: "SUCCESSOR_SAME_AS_TARGET"
    });
  });

  it("revokes access, sessions and assigned work through the store", async () => {
    const store = new FakeMemberAccessStore();
    store.members.set(
      "primary",
      member({ id: "primary", role: "PRIMARY_ADMIN" })
    );
    store.members.set(
      "operator",
      member({ id: "operator", role: "OPERATOR" })
    );

    const result = await revokeMemberAccess(
      "primary",
      "operator",
      "primary",
      store
    );

    expect(store.lastRevocation).toEqual({
      actorId: "primary",
      targetId: "operator",
      successorId: "primary"
    });
    expect(result).toMatchObject({
      revokedSessions: 2,
      reassignedUsers: 3,
      transferredTasks: 4,
      failedUsers: 0
    });
  });

  it("prevents administrators from revoking other administrators", async () => {
    const store = new FakeMemberAccessStore();
    store.members.set(
      "admin-1",
      member({ id: "admin-1", role: "ADMIN" })
    );
    store.members.set(
      "admin-2",
      member({ id: "admin-2", role: "ADMIN" })
    );

    await expect(
      revokeMemberAccess(
        "admin-1",
        "admin-2",
        "admin-1",
        store
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
