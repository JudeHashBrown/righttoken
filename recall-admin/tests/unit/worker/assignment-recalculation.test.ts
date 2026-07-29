import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRun: vi.fn(),
  updateRun: vi.fn(),
  findUsers: vi.fn(),
  findTasks: vi.fn(),
  assignUserOwner: vi.fn(),
  assignTask: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    assignmentRecalculationRun: {
      findUniqueOrThrow: mocks.findRun,
      update: mocks.updateRun
    },
    userProfile: {
      findMany: mocks.findUsers
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

import { handleAssignmentRecalculation } from "@/worker/handlers/assignment-recalculation";

describe("assignment recalculation worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates owners and open tasks for every user in the batch", async () => {
    mocks.findRun.mockResolvedValue({
      id: "run-1",
      status: "PENDING",
      processedUsers: 0,
      failedUsers: 0,
      startedAt: null,
      upperBoundUserId: "user-z",
      lastProcessedUserId: null
    });
    mocks.findUsers.mockResolvedValue([
      {
        id: "user-1",
        ownerId: "old-owner",
        ownerAssignmentMode: "AUTO"
      }
    ]);
    mocks.assignUserOwner.mockResolvedValue({
      assigneeId: "new-owner",
      assignmentMode: "AUTO",
      skippedManual: false
    });
    mocks.findTasks.mockResolvedValue([{ id: "task-1" }]);
    mocks.updateRun
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        processedUsers: 1,
        failedUsers: 0
      });

    await expect(
      handleAssignmentRecalculation(
        { runId: "run-1" },
        new Date("2026-07-26T06:30:00.000Z")
      )
    ).resolves.toMatchObject({
      completed: true,
      processedUsers: 1,
      failedUsers: 0
    });

    expect(mocks.assignUserOwner).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-07-26T06:30:00.000Z")
    );
    expect(mocks.assignTask).toHaveBeenCalledWith(
      "task-1",
      new Date("2026-07-26T06:30:00.000Z")
    );
    expect(mocks.updateRun).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerChanges: { increment: 1 },
          reassignedTasks: { increment: 1 }
        })
      })
    );
    expect(mocks.findUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerAssignmentMode: "AUTO"
        })
      })
    );
  });
});
