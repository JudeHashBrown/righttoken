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
    assignUserOwnerInTransaction: vi.fn(),
    recalculateStoredUserLocation: vi.fn(),
    loadActiveLocationRules: vi.fn(),
    createGeoIpResolver: vi.fn()
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

vi.mock("@/modules/location/recompute-user", () => ({
  recalculateStoredUserLocation:
    mocks.recalculateStoredUserLocation
}));

vi.mock("@/modules/location/rule-repository", () => ({
  loadActiveLocationRules: mocks.loadActiveLocationRules
}));

vi.mock("@/modules/geoip/http-resolver", () => ({
  createGeoIpResolver: mocks.createGeoIpResolver
}));

import {
  manuallyAssignUserLocation,
  restoreAutomaticUserLocation
} from "@/modules/users/user-location-service";

describe("user location service", () => {
  const now = new Date("2026-07-30T06:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.member.findUniqueOrThrow.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      active: true
    });
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      email: "user@example.test",
      registrationIpEnc: null,
      ipCountryCode: "CN",
      ipRegion: "北京",
      countryCode: null,
      region: null,
      locationAssignmentMode: "AUTO",
      ownerId: "operator-1",
      ownerAssignmentMode: "AUTO",
      sourceDeletedAt: null
    });
    mocks.tx.userProfile.update.mockResolvedValue({});
    mocks.tx.recallTask.findMany.mockResolvedValue([
      { id: "task-1", assigneeId: "operator-1" }
    ]);
    mocks.tx.recallTask.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.taskActivity.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.auditLog.create.mockResolvedValue({});
    mocks.assignUserOwnerInTransaction.mockResolvedValue({
      assigneeId: "operator-2",
      assignmentMode: "AUTO",
      skippedManual: false,
      assignmentReason: "广东地区由运营乙负责",
      matchedRuleId: "rule-2"
    });
    mocks.loadActiveLocationRules.mockResolvedValue([]);
    mocks.createGeoIpResolver.mockReturnValue({});
  });

  it("locks a manual location and recalculates an automatic owner", async () => {
    await expect(
      manuallyAssignUserLocation({
        userId: "user-1",
        actorId: "admin-1",
        countryCode: " cn ",
        region: " 广东 ",
        reason: "客户在沟通中确认",
        now
      })
    ).resolves.toMatchObject({
      userId: "user-1",
      countryCode: "CN",
      region: "广东",
      mode: "MANUAL",
      previousOwnerId: "operator-1",
      ownerId: "operator-2",
      ownerRecalculated: true,
      transferredTasks: 1
    });

    expect(mocks.tx.userProfile.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        countryCode: "CN",
        region: "广东",
        locationSource: null,
        locationRuleId: null,
        locationEvaluatedAt: now,
        locationAssignmentMode: "MANUAL",
        locationAssignedAt: now,
        locationAssignedById: "admin-1",
        locationAssignmentReason: "客户在沟通中确认"
      }
    });
    expect(
      mocks.assignUserOwnerInTransaction
    ).toHaveBeenCalledWith(mocks.tx, "user-1", now, {
      forceAutomatic: true
    });
    expect(mocks.tx.recallTask.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["task-1"] } },
      data: { assigneeId: "operator-2" }
    });
  });

  it("keeps a manually assigned owner when location changes", async () => {
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      email: "user@example.test",
      registrationIpEnc: null,
      ipCountryCode: "CN",
      ipRegion: "北京",
      countryCode: "CN",
      region: "北京",
      locationAssignmentMode: "AUTO",
      ownerId: "operator-9",
      ownerAssignmentMode: "MANUAL",
      sourceDeletedAt: null
    });

    await expect(
      manuallyAssignUserLocation({
        userId: "user-1",
        actorId: "admin-1",
        countryCode: "CN",
        region: "广东",
        reason: "客户在沟通中确认",
        now
      })
    ).resolves.toMatchObject({
      ownerId: "operator-9",
      ownerRecalculated: false,
      transferredTasks: 0
    });

    expect(
      mocks.assignUserOwnerInTransaction
    ).not.toHaveBeenCalled();
    expect(mocks.tx.recallTask.findMany).not.toHaveBeenCalled();
  });

  it("restores automatic location from stored source facts", async () => {
    mocks.tx.userProfile.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      email: "user@example.test",
      registrationIpEnc: null,
      ipCountryCode: "US",
      ipRegion: "California",
      countryCode: "CN",
      region: "广东",
      locationAssignmentMode: "MANUAL",
      ownerId: "operator-1",
      ownerAssignmentMode: "AUTO",
      sourceDeletedAt: null
    });
    mocks.recalculateStoredUserLocation.mockResolvedValue({
      countryCode: "US",
      region: "California",
      ipCountryCode: "US",
      ipRegion: "California",
      source: "IP_GEOIP",
      ruleId: null
    });

    await expect(
      restoreAutomaticUserLocation({
        userId: "user-1",
        actorId: "admin-1",
        now
      })
    ).resolves.toMatchObject({
      countryCode: "US",
      region: "California",
      mode: "AUTO",
      ownerRecalculated: true
    });

    expect(mocks.recalculateStoredUserLocation).toHaveBeenCalledWith(
      {
        email: "user@example.test",
        registrationIp: null,
        ipCountryCode: "US",
        ipRegion: "California"
      },
      [],
      {}
    );
    expect(mocks.tx.userProfile.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        countryCode: "US",
        region: "California",
        ipCountryCode: "US",
        ipRegion: "California",
        locationSource: "IP_GEOIP",
        locationRuleId: null,
        locationEvaluatedAt: now,
        locationAssignmentMode: "AUTO",
        locationAssignedAt: now,
        locationAssignedById: null,
        locationAssignmentReason: null
      }
    });
  });
});
