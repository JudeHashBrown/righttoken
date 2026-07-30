import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRun: vi.fn(),
  updateRun: vi.fn(),
  findUsers: vi.fn(),
  updateUser: vi.fn(),
  findLocationRules: vi.fn(),
  findTasks: vi.fn(),
  assignUserOwner: vi.fn(),
  assignTask: vi.fn(),
  recalculateStoredUserLocation: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    locationRecalculationRun: {
      findUniqueOrThrow: mocks.findRun,
      update: mocks.updateRun
    },
    locationAttributionRule: {
      findMany: mocks.findLocationRules
    },
    userProfile: {
      findMany: mocks.findUsers,
      update: mocks.updateUser
    },
    recallTask: {
      findMany: mocks.findTasks
    }
  }
}));

vi.mock("@/modules/assignment/assign-task", () => ({
  assignUserOwner: mocks.assignUserOwner,
  assignTask: mocks.assignTask
}));

vi.mock("@/modules/location/recompute-user", () => ({
  recalculateStoredUserLocation:
    mocks.recalculateStoredUserLocation
}));

import { handleLocationRecalculation } from "@/worker/handlers/location-recalculation";

describe("location recalculation worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findRun.mockResolvedValue({
      id: "run-1",
      status: "PENDING",
      processedUsers: 0,
      succeededUsers: 0,
      failedUsers: 0,
      startedAt: null,
      upperBoundUserId: "user-z",
      lastProcessedUserId: null,
      ruleSnapshot: [
        {
          id: "location-rule-1",
          name: "示例邮箱来源",
          enabled: true,
          priority: 1,
          matchType: "EXACT_DOMAIN",
          pattern: "example.test",
          countryCode: "CN"
        }
      ]
    });
    mocks.findLocationRules.mockResolvedValue([]);
    mocks.findUsers.mockResolvedValue([
      {
        id: "user-1",
        email: "user@example.test",
        registrationIpEnc: null,
        ipCountryCode: "CN",
        ipRegion: "广东",
        countryCode: "CN",
        region: "广东",
        locationAssignmentMode: "MANUAL"
      }
    ]);
    mocks.recalculateStoredUserLocation.mockResolvedValue({
      countryCode: "US",
      region: "California",
      ipCountryCode: "US",
      ipRegion: "California",
      source: "IP_GEOIP",
      ruleId: null
    });
    mocks.updateRun
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        processedUsers: 1,
        failedUsers: 0
      });
  });

  it("skips a manual location without failing the run", async () => {
    await expect(
      handleLocationRecalculation(
        { runId: "run-1" },
        new Date("2026-07-30T08:00:00.000Z")
      )
    ).resolves.toMatchObject({
      completed: true,
      processedUsers: 1,
      failedUsers: 0
    });

    expect(
      mocks.recalculateStoredUserLocation
    ).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.assignUserOwner).not.toHaveBeenCalled();
    expect(mocks.assignTask).not.toHaveBeenCalled();
    expect(mocks.updateRun).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        processedUsers: { increment: 1 },
        succeededUsers: { increment: 1 },
        lastProcessedUserId: "user-1"
      }
    });
  });
});
