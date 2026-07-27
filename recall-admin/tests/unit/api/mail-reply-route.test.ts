import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  class MailSendBlockedError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    getMailboxRuntimeConfig: vi.fn(),
    createSmtpImapAdapter: vi.fn(),
    replyToMailThread: vi.fn(),
    UnauthorizedError,
    ForbiddenError,
    MailSendBlockedError
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
vi.mock("@/modules/mail/mailbox-credentials", () => ({
  getMailboxRuntimeConfig: mocks.getMailboxRuntimeConfig
}));
vi.mock("@/modules/mail/adapters/smtp-imap", () => ({
  createSmtpImapAdapter: mocks.createSmtpImapAdapter
}));
vi.mock("@/modules/mail/reply-to-thread", () => ({
  replyToMailThread: mocks.replyToMailThread
}));
vi.mock("@/modules/mail/send-guard", () => ({
  MailSendBlockedError: mocks.MailSendBlockedError
}));

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/mail/reply", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

const validBody = {
  threadId: "thread-1",
  taskId: "task-1",
  mailboxId: "mailbox-1",
  recipient: "person@example.test",
  subject: "Re: 支付协助",
  bodyText: "我们已经收到你的问题。",
  templateId: "template-1"
};

describe("mail thread reply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "operator-1", role: "OPERATOR" }
    });
    mocks.getMailboxRuntimeConfig.mockResolvedValue({
      emailAddress: "support@example.test"
    });
    mocks.createSmtpImapAdapter.mockReturnValue({
      send: vi.fn()
    });
  });

  it("sends reviewed content in the selected thread", async () => {
    mocks.replyToMailThread.mockResolvedValue({
      id: "message-1",
      status: "SENT",
      sentAt: new Date("2026-07-27T12:00:00.000Z")
    });
    const { POST } = await import("@/app/api/mail/reply/route");

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(mocks.replyToMailThread).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "operator-1",
        threadId: "thread-1",
        templateId: "template-1"
      }),
      expect.objectContaining({ send: expect.any(Function) })
    );
  });

  it("rejects an invalid reply request", async () => {
    const { POST } = await import("@/app/api/mail/reply/route");

    const response = await POST(request({ subject: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_MAIL_REPLY_REQUEST"
    });
  });

  it("returns the stable suppression error", async () => {
    mocks.replyToMailThread.mockRejectedValue(
      new mocks.MailSendBlockedError("RECIPIENT_SUPPRESSED")
    );
    const { POST } = await import("@/app/api/mail/reply/route");

    const response = await POST(request(validBody));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "RECIPIENT_SUPPRESSED"
    });
  });
});
