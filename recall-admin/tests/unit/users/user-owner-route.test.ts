import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireRequestPermission: vi.fn(),
  manuallyAssignUserOwner: vi.fn(),
  restoreAutomaticUserOwner: vi.fn()
}));

vi.mock("@/modules/auth/csrf", () => ({
  assertSameOrigin: mocks.assertSameOrigin
}));

vi.mock("@/modules/auth/guards", () => ({
  requireRequestPermission: mocks.requireRequestPermission,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {}
}));

vi.mock("@/modules/users/user-owner-service", () => ({
  manuallyAssignUserOwner: mocks.manuallyAssignUserOwner,
  restoreAutomaticUserOwner: mocks.restoreAutomaticUserOwner
}));

import {
  DELETE,
  PATCH
} from "@/app/api/users/[id]/owner/route";

describe("user owner route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "admin-1", role: "ADMIN" }
    });
  });

  it("manually assigns an owner for an administrator", async () => {
    mocks.manuallyAssignUserOwner.mockResolvedValue({
      userId: "user-1",
      previousOwnerId: "operator-1",
      ownerId: "operator-2",
      mode: "MANUAL",
      transferredTasks: 2
    });

    const response = await PATCH(
      new NextRequest(
        "http://127.0.0.1:3101/api/users/user-1/owner",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3101"
          },
          body: JSON.stringify({
            ownerId: "operator-2",
            reason: "交给当地运营继续跟进"
          })
        }
      ),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        ownerId: "operator-2",
        mode: "MANUAL",
        transferredTasks: 2
      }
    });
    expect(mocks.requireRequestPermission).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "operators:manage"
    );
  });

  it("rejects an invalid manual assignment request", async () => {
    const response = await PATCH(
      new NextRequest(
        "http://127.0.0.1:3101/api/users/user-1/owner",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3101"
          },
          body: JSON.stringify({
            ownerId: "",
            reason: ""
          })
        }
      ),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_OWNER_CHANGE"
    });
    expect(mocks.manuallyAssignUserOwner).not.toHaveBeenCalled();
  });

  it("restores automatic assignment", async () => {
    mocks.restoreAutomaticUserOwner.mockResolvedValue({
      userId: "user-1",
      previousOwnerId: "operator-2",
      ownerId: "operator-1",
      mode: "AUTO",
      transferredTasks: 2
    });

    const response = await DELETE(
      new NextRequest(
        "http://127.0.0.1:3101/api/users/user-1/owner",
        {
          method: "DELETE",
          headers: {
            origin: "http://127.0.0.1:3101"
          }
        }
      ),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        ownerId: "operator-1",
        mode: "AUTO"
      }
    });
  });
});
