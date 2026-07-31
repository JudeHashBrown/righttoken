import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireRequestPermission: vi.fn(),
  resolveUserAssignment: vi.fn()
}));

vi.mock("@/modules/auth/csrf", () => ({
  assertSameOrigin: mocks.assertSameOrigin
}));

vi.mock("@/modules/auth/guards", () => ({
  requireRequestPermission: mocks.requireRequestPermission,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {}
}));

vi.mock("@/modules/users/resolve-user-assignment", () => ({
  resolveUserAssignment: mocks.resolveUserAssignment
}));

import { PATCH } from "@/app/api/users/[id]/assignment/route";

function request(body: unknown): NextRequest {
  return new NextRequest(
    "http://127.0.0.1:3101/api/users/user-1/assignment",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:3101"
      },
      body: JSON.stringify(body)
    }
  );
}

const context = {
  params: Promise.resolve({ id: "user-1" })
};

describe("user assignment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "admin-1", role: "ADMIN" }
    });
    mocks.resolveUserAssignment.mockResolvedValue({
      userId: "user-1",
      countryCode: "CN",
      region: "广东",
      ownerId: "operator-1",
      ownerAssignmentMode: "AUTO",
      matchedRuleId: "rule-1",
      transferredTasks: 1
    });
  });

  it("resolves a user location and owner for an administrator", async () => {
    const response = await PATCH(
      request({
        countryCode: "cn",
        region: " 广东 ",
        ownerId: "operator-1",
        reason: "确认地区并指定负责人"
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveUserAssignment).toHaveBeenCalledWith({
      userId: "user-1",
      actorId: "admin-1",
      countryCode: "cn",
      region: "广东",
      targetOwnerId: "operator-1",
      reason: "确认地区并指定负责人"
    });
  });

  it.each([
    [{ reason: "没有地区或负责人" }],
    [{ region: "广东", reason: "缺少国家" }],
    [{ countryCode: "China", reason: "国家码无效" }],
    [{ ownerId: "operator-1", reason: "" }]
  ])("rejects an invalid assignment payload", async (body) => {
    const response = await PATCH(request(body), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_ASSIGNMENT"
    });
    expect(mocks.resolveUserAssignment).not.toHaveBeenCalled();
  });
});
