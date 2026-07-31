import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    member: {
      findUniqueOrThrow: vi.fn()
    },
    userProfile: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn()
    },
    recallTask: {
      findMany: vi.fn(),
      updateMany: vi.fn()
    },
    taskActivity: {
      createMany: vi.fn()
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

import {
  manuallyAssignUserOwner,
  restoreAutomaticUserOwner
} from "@/modules/users/user-owner-service";

describe("user owner service", () => {
  const now = new Date("2026-07-29T09:30:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.member.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "admin-1",
        role: "ADMIN",
        active: true
      })
      .mockResolvedValueOnce({
        id: "operator-2",
        role: "OPERATOR",
        active: true
      });
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      ownerId: "operator-1",
      ownerAssignmentMode: "AUTO",
      ownerAssignedAt: new Date("2026-07-29T08:00:00.000Z"),
      countryCode: "CN",
      region: "广东",
      sourceDeletedAt: null
    });
    mocks.tx.recallTask.findMany.mockResolvedValue([
      { id: "task-1", assigneeId: "operator-1" },
      { id: "task-2", assigneeId: "operator-1" }
    ]);
    mocks.tx.recallTask.updateMany.mockResolvedValue({ count: 2 });
    mocks.tx.userProfile.update.mockResolvedValue({});
    mocks.tx.taskActivity.createMany.mockResolvedValue({ count: 2 });
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("locks a manual owner and transfers all open tasks", async () => {
    await expect(
      manuallyAssignUserOwner({
        userId: "user-1",
        actorId: "admin-1",
        targetOwnerId: "operator-2",
        reason: "由广东运营继续跟进",
        now
      })
    ).resolves.toEqual({
      userId: "user-1",
      previousOwnerId: "operator-1",
      ownerId: "operator-2",
      mode: "MANUAL",
      transferredTasks: 2
    });

    expect(mocks.tx.userProfile.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        ownerId: "operator-2",
        ownerAssignmentMode: "MANUAL",
        ownerAssignedAt: now,
        ownerAssignedById: "admin-1",
        ownerAssignmentReason: "由广东运营继续跟进"
      }
    });
    expect(mocks.tx.recallTask.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["task-1", "task-2"] } },
      data: { assigneeId: "operator-2" }
    });
  });

  it("allows an administrator to assign an initially unassigned user", async () => {
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      ownerId: null,
      ownerAssignmentMode: "AUTO",
      ownerAssignedAt: null,
      countryCode: "DE",
      region: null,
      sourceDeletedAt: null
    });
    mocks.tx.recallTask.findMany.mockResolvedValue([]);

    await expect(
      manuallyAssignUserOwner({
        userId: "user-1",
        actorId: "admin-1",
        targetOwnerId: "operator-2",
        reason: "德国暂由运营乙负责",
        now
      })
    ).resolves.toEqual({
      userId: "user-1",
      previousOwnerId: null,
      ownerId: "operator-2",
      mode: "MANUAL",
      transferredTasks: 0
    });
    expect(mocks.tx.userProfile.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        ownerId: "operator-2",
        ownerAssignmentMode: "MANUAL",
        ownerAssignedAt: now,
        ownerAssignedById: "admin-1",
        ownerAssignmentReason: "德国暂由运营乙负责"
      }
    });
  });

  it("restores automatic assignment and moves open work", async () => {
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      ownerId: "operator-2",
      ownerAssignmentMode: "MANUAL",
      ownerAssignedAt: now,
      countryCode: "CN",
      region: "广东",
      sourceDeletedAt: null
    });
    mocks.assignUserOwnerInTransaction.mockResolvedValue({
      assigneeId: "operator-1",
      assignmentMode: "AUTO",
      skippedManual: false,
      assignmentReason: "广东地区由运营甲负责"
    });

    await expect(
      restoreAutomaticUserOwner({
        userId: "user-1",
        actorId: "admin-1",
        now
      })
    ).resolves.toEqual({
      userId: "user-1",
      previousOwnerId: "operator-2",
      ownerId: "operator-1",
      mode: "AUTO",
      transferredTasks: 2
    });

    expect(
      mocks.assignUserOwnerInTransaction
    ).toHaveBeenCalledWith(mocks.tx, "user-1", now, {
      forceAutomatic: true
    });
    expect(mocks.tx.recallTask.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["task-1", "task-2"] } },
      data: { assigneeId: "operator-1" }
    });
  });
});
