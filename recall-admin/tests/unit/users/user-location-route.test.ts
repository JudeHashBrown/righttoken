import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireRequestPermission: vi.fn(),
  manuallyAssignUserLocation: vi.fn(),
  restoreAutomaticUserLocation: vi.fn()
}));

vi.mock("@/modules/auth/csrf", () => ({
  assertSameOrigin: mocks.assertSameOrigin
}));

vi.mock("@/modules/auth/guards", () => ({
  requireRequestPermission: mocks.requireRequestPermission,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {}
}));

vi.mock("@/modules/users/user-location-service", () => ({
  manuallyAssignUserLocation: mocks.manuallyAssignUserLocation,
  restoreAutomaticUserLocation: mocks.restoreAutomaticUserLocation
}));

import {
  DELETE,
  PATCH
} from "@/app/api/users/[id]/location/route";

describe("user location route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "admin-1", role: "ADMIN" }
    });
  });

  it("confirms a location for an administrator", async () => {
    mocks.manuallyAssignUserLocation.mockResolvedValue({
      userId: "user-1",
      countryCode: "CN",
      region: "广东",
      mode: "MANUAL",
      ownerId: "operator-2",
      ownerRecalculated: true,
      transferredTasks: 1
    });

    const response = await PATCH(
      new NextRequest(
        "http://127.0.0.1:3101/api/users/user-1/location",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3101"
          },
          body: JSON.stringify({
            countryCode: "cn",
            region: " 广东 ",
            reason: "客户在沟通中确认"
          })
        }
      ),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.manuallyAssignUserLocation).toHaveBeenCalledWith({
      userId: "user-1",
      actorId: "admin-1",
      countryCode: "cn",
      region: "广东",
      reason: "客户在沟通中确认"
    });
    expect(mocks.requireRequestPermission).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "operators:manage"
    );
  });

  it("rejects an invalid country or empty reason", async () => {
    const response = await PATCH(
      new NextRequest(
        "http://127.0.0.1:3101/api/users/user-1/location",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:3101"
          },
          body: JSON.stringify({
            countryCode: "China",
            reason: ""
          })
        }
      ),
      { params: Promise.resolve({ id: "user-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_LOCATION_CHANGE"
    });
    expect(mocks.manuallyAssignUserLocation).not.toHaveBeenCalled();
  });

  it("restores automatic location determination", async () => {
    mocks.restoreAutomaticUserLocation.mockResolvedValue({
      userId: "user-1",
      countryCode: "US",
      region: "California",
      mode: "AUTO",
      ownerId: "operator-3",
      ownerRecalculated: true,
      transferredTasks: 1
    });

    const response = await DELETE(
      new NextRequest(
        "http://127.0.0.1:3101/api/users/user-1/location",
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
    expect(mocks.restoreAutomaticUserLocation).toHaveBeenCalledWith({
      userId: "user-1",
      actorId: "admin-1"
    });
  });
});
