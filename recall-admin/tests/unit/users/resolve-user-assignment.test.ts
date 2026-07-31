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
    assignUserOwnerInTransaction: vi.fn(),
    transferOpenUserTasks: vi.fn()
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

vi.mock("@/modules/users/transfer-open-user-tasks", () => ({
  transferOpenUserTasks: mocks.transferOpenUserTasks
}));

import { resolveUserAssignment } from "@/modules/users/resolve-user-assignment";

describe("resolve user assignment", () => {
  const now = new Date("2026-07-31T08:30:00.000Z");
  const baseUser = {
    id: "user-1",
    countryCode: null,
    region: null,
    ownerId: null,
    ownerAssignmentMode: "AUTO" as const,
    sourceDeletedAt: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.member.findUniqueOrThrow.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      active: true
    });
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue(
      baseUser
    );
    mocks.tx.userProfile.update.mockResolvedValue({});
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.transferOpenUserTasks.mockResolvedValue(0);
  });

  it("uses the location rule when only geography is supplied", async () => {
    mocks.assignUserOwnerInTransaction.mockResolvedValue({
      assigneeId: "operator-south",
      assignmentMode: "AUTO",
      skippedManual: false,
      matchedRuleId: "rule-south",
      assignmentReason: "规则“华南”命中"
    });

    await expect(
      resolveUserAssignment({
        userId: "user-1",
        actorId: "admin-1",
        countryCode: " cn ",
        region: " 广东 ",
        reason: "确认注册地区",
        now
      })
    ).resolves.toEqual({
      userId: "user-1",
      countryCode: "CN",
      region: "广东",
      ownerId: "operator-south",
      ownerAssignmentMode: "AUTO",
      matchedRuleId: "rule-south",
      transferredTasks: 0
    });

    expect(mocks.tx.userProfile.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        countryCode: "CN",
        region: "广东",
        locationAssignmentMode: "MANUAL",
        locationAssignedById: "admin-1"
      })
    });
    expect(
      mocks.assignUserOwnerInTransaction
    ).toHaveBeenCalledWith(mocks.tx, "user-1", now, {
      forceAutomatic: true
    });
  });

  it("keeps the user unassigned when the supplied location has no rule", async () => {
    mocks.assignUserOwnerInTransaction.mockResolvedValue({
      assigneeId: null,
      assignmentMode: "AUTO",
      skippedManual: false,
      matchedRuleId: null,
      assignmentReason: "没有规则命中；进入公共池"
    });

    await expect(
      resolveUserAssignment({
        userId: "user-1",
        actorId: "admin-1",
        countryCode: "DE",
        reason: "确认注册地区",
        now
      })
    ).resolves.toMatchObject({
      countryCode: "DE",
      ownerId: null,
      ownerAssignmentMode: "AUTO"
    });
  });

  it("prefers the explicit owner over a matching location rule", async () => {
    mocks.tx.member.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "admin-1",
        role: "ADMIN",
        active: true
      })
      .mockResolvedValueOnce({
        id: "operator-manual",
        role: "OPERATOR",
        active: true
      });
    mocks.assignUserOwnerInTransaction.mockResolvedValue({
      assigneeId: "operator-south",
      assignmentMode: "AUTO",
      skippedManual: false,
      matchedRuleId: "rule-south",
      assignmentReason: "规则“华南”命中"
    });

    await expect(
      resolveUserAssignment({
        userId: "user-1",
        actorId: "admin-1",
        countryCode: "CN",
        region: "广东",
        targetOwnerId: "operator-manual",
        reason: "指定专人负责",
        now
      })
    ).resolves.toMatchObject({
      ownerId: "operator-manual",
      ownerAssignmentMode: "MANUAL",
      matchedRuleId: "rule-south"
    });

    expect(mocks.tx.userProfile.update).toHaveBeenLastCalledWith({
      where: { id: "user-1" },
      data: {
        ownerId: "operator-manual",
        ownerAssignmentMode: "MANUAL",
        ownerAssignedAt: now,
        ownerAssignedById: "admin-1",
        ownerAssignmentReason: "指定专人负责"
      }
    });
  });

  it("keeps an existing manual owner when only geography changes", async () => {
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
      ...baseUser,
      ownerId: "operator-locked",
      ownerAssignmentMode: "MANUAL"
    });

    await expect(
      resolveUserAssignment({
        userId: "user-1",
        actorId: "admin-1",
        countryCode: "JP",
        reason: "确认地区",
        now
      })
    ).resolves.toMatchObject({
      ownerId: "operator-locked",
      ownerAssignmentMode: "MANUAL",
      matchedRuleId: null
    });

    expect(
      mocks.assignUserOwnerInTransaction
    ).not.toHaveBeenCalled();
  });

  it("writes one combined audit record with the final state", async () => {
    mocks.assignUserOwnerInTransaction.mockResolvedValue({
      assigneeId: null,
      assignmentMode: "AUTO",
      skippedManual: false,
      matchedRuleId: null,
      assignmentReason: "没有规则命中；进入公共池"
    });

    await resolveUserAssignment({
      userId: "user-1",
      actorId: "admin-1",
      countryCode: "DE",
      reason: "确认地区",
      now
    });

    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin-1",
        action: "user.assignment_resolved",
        entityType: "UserProfile",
        entityId: "user-1",
        metadata: expect.objectContaining({
          previousCountryCode: null,
          countryCode: "DE",
          previousOwnerId: null,
          ownerId: null,
          ownerAssignmentMode: "AUTO",
          reason: "确认地区"
        })
      })
    });
  });
});
