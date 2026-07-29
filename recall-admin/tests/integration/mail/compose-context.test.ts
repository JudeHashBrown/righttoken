import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  findComposeUsers,
  getComposeContext
} from "@/modules/mail/compose-context";

vi.mock("server-only", () => ({}));

describe("mail compose context", () => {
  const memberIds: string[] = [];
  const userIds: string[] = [];
  let adminId: string;
  let operatorAId: string;
  let operatorBId: string;
  let operatorAUserId: string;
  let operatorBUserId: string;
  let unownedUserId: string;

  beforeAll(async () => {
    const [admin, operatorA, operatorB] = await Promise.all([
      prisma.member.create({
        data: {
          email: `compose-admin-${randomUUID()}@example.test`,
          displayName: "Compose Admin",
          passwordHash: "not-used",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `compose-a-${randomUUID()}@example.test`,
          displayName: "Compose Operator A",
          passwordHash: "not-used",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email: `compose-b-${randomUUID()}@example.test`,
          displayName: "Compose Operator B",
          passwordHash: "not-used",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    operatorAId = operatorA.id;
    operatorBId = operatorB.id;
    memberIds.push(admin.id, operatorA.id, operatorB.id);

    const createUser = (
      label: string,
      ownerId: string | null
    ) => {
      const email = `${label}-${randomUUID()}@example.test`;
      return prisma.userProfile.create({
        data: {
          externalUserId: `${label}-${randomUUID()}`,
          displayName: label,
          email,
          emailNormalized: email,
          registeredAt: new Date("2026-07-28T08:00:00.000Z"),
          currentSegment: "A",
          ownerId
        }
      });
    };
    const [operatorAUser, operatorBUser, unownedUser] =
      await Promise.all([
        createUser("operator-a-user", operatorA.id),
        createUser("operator-b-user", operatorB.id),
        createUser("unowned-user", null)
      ]);
    operatorAUserId = operatorAUser.id;
    operatorBUserId = operatorBUser.id;
    unownedUserId = unownedUser.id;
    userIds.push(
      operatorAUser.id,
      operatorBUser.id,
      unownedUser.id
    );
  });

  afterAll(async () => {
    await prisma.recallTask.deleteMany({
      where: { userId: { in: userIds } }
    });
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: memberIds } }
    });
    await prisma.$disconnect();
  });

  it("limits an operator to owned and unowned users", async () => {
    const ownedUsers = await findComposeUsers(
      { id: operatorAId, role: "OPERATOR" },
      "operator-a-user"
    );
    const unownedUsers = await findComposeUsers(
      { id: operatorAId, role: "OPERATOR" },
      "unowned-user"
    );
    const otherOperatorUsers = await findComposeUsers(
      { id: operatorAId, role: "OPERATOR" },
      "operator-b-user"
    );
    expect(ownedUsers.map((user) => user.id)).toContain(
      operatorAUserId
    );
    expect(unownedUsers.map((user) => user.id)).toContain(
      unownedUserId
    );
    expect(otherOperatorUsers.map((user) => user.id)).not.toContain(
      operatorBUserId
    );
  });

  it("lets an admin search all active users", async () => {
    const users = await findComposeUsers(
      { id: adminId, role: "ADMIN" },
      "operator-b-user"
    );
    expect(users.map((user) => user.id)).toContain(
      operatorBUserId
    );
  });

  it("rejects another operator's task context", async () => {
    const task = await prisma.recallTask.create({
      data: {
        userId: operatorBUserId,
        origin: "MANUAL",
        triggerKey: `compose-${randomUUID()}`,
        ruleVersion: 1,
        title: "其他运营任务",
        reason: "权限测试",
        priority: "NORMAL",
        status: "TODO",
        assigneeId: operatorBId,
        dueAt: new Date("2026-07-29T08:00:00.000Z")
      }
    });

    await expect(
      getComposeContext(
        { id: operatorAId, role: "OPERATOR" },
        { userId: operatorBUserId, taskId: task.id }
      )
    ).resolves.toEqual({
      selectedUser: null,
      selectedTask: null
    });
  });
});
