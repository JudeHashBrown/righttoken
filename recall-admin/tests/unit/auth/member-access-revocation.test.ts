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
      update: vi.fn()
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
      create: vi.fn()
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
      id: "primary-1"
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
    mocks.assignUserOwnerInTransaction.mockResolvedValue({
      assigneeId: "operator-new",
      assignmentMode: "AUTO",
      skippedManual: false,
      assignmentReason: "广东地区由新运营负责"
    });
    mocks.tx.userProfile.update.mockResolvedValue({});
    mocks.tx.recallTask.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    mocks.tx.recallTask.findMany.mockResolvedValue([]);
    mocks.tx.taskActivity.createMany.mockResolvedValue({ count: 3 });
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("reassigns automatic users and gives manual users to the primary administrator", async () => {
    const result = await new PrismaMemberAccessStore().revokeAccess({
      actorId: "admin-1",
      targetId: "operator-old"
    });

    expect(result).toMatchObject({
      revokedSessions: 1,
      reassignedUsers: 2,
      transferredTasks: 3,
      failedUsers: 0
    });
    expect(
      mocks.assignUserOwnerInTransaction
    ).toHaveBeenCalledWith(
      mocks.tx,
      "user-auto",
      expect.any(Date),
      { forceAutomatic: true }
    );
    expect(mocks.tx.userProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-manual" },
        data: expect.objectContaining({
          ownerId: "primary-1",
          ownerAssignmentMode: "MANUAL",
          ownerAssignmentReason:
            "原负责人权限已撤销，由主管理员暂管"
        })
      })
    );
    expect(mocks.tx.recallTask.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeId: null,
          status: "UNASSIGNED"
        })
      })
    );
  });
});
