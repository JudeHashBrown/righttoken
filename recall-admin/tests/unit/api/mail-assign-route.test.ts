import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  class MailMessageAssignmentError extends Error {}
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    assignInboundMessage: vi.fn(),
    UnauthorizedError,
    ForbiddenError,
    MailMessageAssignmentError
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
vi.mock("@/modules/mail/assign-inbound-message", () => ({
  assignInboundMessage: mocks.assignInboundMessage,
  MailMessageAssignmentError: mocks.MailMessageAssignmentError
}));

function request(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/mail/messages/message-1/assign",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost"
      },
      body: JSON.stringify(body)
    }
  );
}

describe("assign inbound mail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "operator-1", role: "OPERATOR" }
    });
  });

  it("assigns an unmatched message to a selected user", async () => {
    mocks.assignInboundMessage.mockResolvedValue({
      message: { id: "message-1", status: "RECEIVED" },
      thread: { id: "thread-1" },
      task: { id: "task-1" }
    });
    const { POST } = await import(
      "@/app/api/mail/messages/[id]/assign/route"
    );

    const response = await POST(request({ userId: "user-1" }), {
      params: Promise.resolve({ id: "message-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.assignInboundMessage).toHaveBeenCalledWith({
      actorId: "operator-1",
      messageId: "message-1",
      userId: "user-1"
    });
  });

  it("rejects an invalid user id", async () => {
    const { POST } = await import(
      "@/app/api/mail/messages/[id]/assign/route"
    );

    const response = await POST(request({ userId: "" }), {
      params: Promise.resolve({ id: "message-1" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_MAIL_ASSIGNMENT_REQUEST"
    });
  });

  it("returns forbidden for a user outside the operator scope", async () => {
    mocks.assignInboundMessage.mockRejectedValue(
      new mocks.ForbiddenError()
    );
    const { POST } = await import(
      "@/app/api/mail/messages/[id]/assign/route"
    );

    const response = await POST(request({ userId: "other-user" }), {
      params: Promise.resolve({ id: "message-1" })
    });

    expect(response.status).toBe(403);
  });
});
