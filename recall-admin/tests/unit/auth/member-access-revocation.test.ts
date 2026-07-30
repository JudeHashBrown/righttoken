import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    member: {
      update: vi.fn(),
      findFirstOrThrow: vi.fn()
    },
    session: {
      deleteMany: vi.fn()
    },
    userProfile: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    recallTask: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    },
    taskActivity: {
      createMany: vi.fn(),
      create: vi.fn()
    },
    auditLog: {
      create: vi.fn(),
      createMany: vi.fn()
    }
  };
  return {
    tx,
    transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx)
    ),
    assignUserOwnerInTransaction: vi.fn()
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction
  }
}));

vi.mock("@/modules/assignment/assign-task", () => ({
  assignUserOwnerInTransaction:
    mocks.assignUserOwnerInTransaction
}));

import { PrismaMemberAccessStore } from "@/modules/auth/member-access";

describe("member access revocation reassignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.member.update.mockResolvedValue({
      id: "operator-old",
      email: "old@example.test",
      displayName: "原运营",
      role: "OPERATOR",
      active: false,
      rightTokenUserId: "rt-old"
    });
    mocks.tx.member.findFirstOrThrow.mockResolvedValue({
      id: "operator-new",
      displayName: "新运营",
      email: "new@example.test",
      active: true
    });
    mocks.tx.session.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.userProfile.findMany.mockResolvedValue([
      {
        id: "user-auto",
        ownerId: "operator-old",
        ownerAssignmentMode: "AUTO",
        countryCode: "CN",
        region: "广东"
      },
      {
        id: "user-manual",
        ownerId: "operator-old",
        ownerAssignmentMode: "MANUAL",
        countryCode: null,
        region: null
      }
    ]);
    mocks.tx.userProfile.updateMany.mockResolvedValue({ count: 2 });
    mocks.tx.recallTask.updateMany.mockResolvedValue({ count: 3 });
    mocks.tx.recallTask.findMany.mockResolvedValue([]);
    mocks.tx.taskActivity.createMany.mockResolvedValue({ count: 3 });
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.tx.auditLog.createMany.mockResolvedValue({ count: 2 });
  });

  it("hands every customer and unfinished task to the selected successor", async () => {
    const result = await new PrismaMemberAccessStore().revokeAccess({
      actorId: "admin-1",
      targetId: "operator-old",
      successorId: "operator-new"
    });

    expect(result).toMatchObject({
      revokedSessions: 1,
      reassignedUsers: 2,
      transferredTasks: 3,
      failedUsers: 0,
      successor: {
        id: "operator-new",
        displayName: "新运营",
        email: "new@example.test"
      }
    });
    expect(mocks.tx.userProfile.updateMany).toHaveBeenCalledWith({
      where: { ownerId: "operator-old" },
      data: expect.objectContaining({
        ownerId: "operator-new",
        ownerAssignmentMode: "MANUAL",
        ownerAssignedById: "admin-1",
        ownerAssignmentReason:
          "原负责人权限已撤销，由指定成员接管"
      })
    });
    expect(mocks.tx.recallTask.updateMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            "UNASSIGNED",
            "TODO",
            "IN_PROGRESS",
            "WAITING_USER",
            "PAUSED"
          ]
        },
        OR: [
          { userId: { in: ["user-auto", "user-manual"] } },
          { assigneeId: "operator-old" }
        ]
      },
      data: { assigneeId: "operator-new" }
    });
    expect(
      mocks.assignUserOwnerInTransaction
    ).not.toHaveBeenCalled();
  });
});
