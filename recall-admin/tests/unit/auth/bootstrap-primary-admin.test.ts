import { describe, expect, it } from "vitest";
import {
  bootstrapPrimaryAdmin,
  type PrimaryAdminStore
} from "@/modules/auth/bootstrap-primary-admin";

type FakeMember = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";
  active: boolean;
};

function createFakeStore(seed: FakeMember[] = []): {
  store: PrimaryAdminStore;
  members: FakeMember[];
} {
  const members = [...seed];
  const store: PrimaryAdminStore = {
    async listPrimaryAdmins() {
      return members
        .filter((member) => member.role === "PRIMARY_ADMIN")
        .map(({ id, email }) => ({ id, email }));
    },
    async findMemberByEmail(email) {
      const member = members.find((item) => item.email === email);
      return member ? { id: member.id } : null;
    },
    async upsertPrimaryAdmin(input) {
      const existing = members.find(
        (member) => member.email === input.email
      );
      if (existing) {
        Object.assign(existing, input, {
          role: "PRIMARY_ADMIN" as const,
          active: true
        });
        return { id: existing.id };
      }

      const member: FakeMember = {
        id: `member-${members.length + 1}`,
        ...input,
        role: "PRIMARY_ADMIN",
        active: true
      };
      members.push(member);
      return { id: member.id };
    }
  };
  return { store, members };
}

const hashPassword = async (password: string) => `hashed:${password}`;

describe("bootstrapPrimaryAdmin", () => {
  it("creates one primary administrator and is idempotent", async () => {
    const { store, members } = createFakeStore();
    const dependencies = { store, hashPassword };

    const first = await bootstrapPrimaryAdmin(
      {
        email: " Primary.Admin@Example.Test ",
        password: "bootstrap-test-password-123",
        displayName: "测试主管理员"
      },
      dependencies
    );
    const second = await bootstrapPrimaryAdmin(
      {
        email: "primary.admin@example.test",
        password: "bootstrap-test-password-456",
        displayName: "主管理员"
      },
      dependencies
    );

    expect(first).toEqual({ id: "member-1", created: true });
    expect(second).toEqual({ id: "member-1", created: false });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      email: "primary.admin@example.test",
      displayName: "主管理员",
      passwordHash: "hashed:bootstrap-test-password-456",
      role: "PRIMARY_ADMIN",
      active: true
    });
  });

  it("refuses to replace a different primary administrator", async () => {
    const { store } = createFakeStore([
      {
        id: "existing-primary",
        email: "owner@example.test",
        displayName: "Existing Owner",
        passwordHash: "existing-hash",
        role: "PRIMARY_ADMIN",
        active: true
      }
    ]);

    await expect(
      bootstrapPrimaryAdmin(
        {
          email: "replacement@example.test",
          password: "bootstrap-test-password-123"
        },
        { store, hashPassword }
      )
    ).rejects.toThrow("a different primary admin already exists");
  });

  it("rejects a password shorter than twelve characters", async () => {
    const { store } = createFakeStore();

    await expect(
      bootstrapPrimaryAdmin(
        {
          email: "primary@example.test",
          password: "too-short"
        },
        { store, hashPassword }
      )
    ).rejects.toThrow();
  });
});
