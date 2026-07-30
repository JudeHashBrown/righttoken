import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  class MemberAccessError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    revokeMemberAccess: vi.fn(),
    UnauthorizedError,
    ForbiddenError,
    MemberAccessError
  };
});

vi.mock("@/modules/auth/csrf", () => ({
  assertSameOrigin: mocks.assertSameOrigin
}));

vi.mock("@/modules/auth/guards", () => ({
  requireRequestPermission: mocks.requireRequestPermission,
  UnauthorizedError: mocks.UnauthorizedError,
  ForbiddenError: mocks.ForbiddenError
}));

vi.mock("@/modules/auth/member-access", () => ({
  revokeMemberAccess: mocks.revokeMemberAccess,
  MemberAccessError: mocks.MemberAccessError
}));

function request(body?: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/members/operator-old/access",
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost"
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) })
    }
  );
}

describe("member access revocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "admin-1", role: "ADMIN" }
    });
    mocks.revokeMemberAccess.mockResolvedValue({
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
  });

  it("passes the selected successor to the handover service", async () => {
    const { DELETE } = await import(
      "@/app/api/members/[id]/access/route"
    );

    const response = await DELETE(
      request({ successorId: "operator-new" }),
      { params: Promise.resolve({ id: "operator-old" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.revokeMemberAccess).toHaveBeenCalledWith(
      "admin-1",
      "operator-old",
      "operator-new"
    );
  });

  it("rejects a request without a successor", async () => {
    const { DELETE } = await import(
      "@/app/api/members/[id]/access/route"
    );

    const response = await DELETE(request({}), {
      params: Promise.resolve({ id: "operator-old" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "SUCCESSOR_REQUIRED"
    });
    expect(mocks.revokeMemberAccess).not.toHaveBeenCalled();
  });

  it.each([
    ["SUCCESSOR_NOT_FOUND", 404],
    ["SUCCESSOR_INACTIVE", 409],
    ["SUCCESSOR_SAME_AS_TARGET", 409]
  ])("maps %s to a stable response", async (code, status) => {
    mocks.revokeMemberAccess.mockRejectedValue(
      new mocks.MemberAccessError(code)
    );
    const { DELETE } = await import(
      "@/app/api/members/[id]/access/route"
    );

    const response = await DELETE(
      request({ successorId: "operator-new" }),
      { params: Promise.resolve({ id: "operator-old" }) }
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ code });
  });
});
