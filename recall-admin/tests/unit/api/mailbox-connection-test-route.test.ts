import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    getMailboxRuntimeConfig: vi.fn(),
    getMailboxRuntimeConfiguration: vi.fn(),
    createSmtpImapAdapter: vi.fn(),
    classifyMailSyncError: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    UnauthorizedError,
    ForbiddenError
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    mailbox: {
      update: mocks.update,
      updateMany: mocks.updateMany
    }
  }
}));
vi.mock("@/modules/auth/csrf", () => ({
  assertSameOrigin: mocks.assertSameOrigin
}));
vi.mock("@/modules/auth/guards", () => ({
  requireRequestPermission: mocks.requireRequestPermission,
  UnauthorizedError: mocks.UnauthorizedError,
  ForbiddenError: mocks.ForbiddenError
}));
vi.mock("@/modules/mail/mailbox-credentials", () => ({
  getMailboxRuntimeConfig: mocks.getMailboxRuntimeConfig,
  getMailboxRuntimeConfiguration:
    mocks.getMailboxRuntimeConfiguration
}));
vi.mock("@/modules/mail/adapters/smtp-imap", () => ({
  createSmtpImapAdapter: mocks.createSmtpImapAdapter
}));
vi.mock("@/modules/mail/sync-error", () => ({
  classifyMailSyncError: mocks.classifyMailSyncError
}));

function request(): NextRequest {
  return new NextRequest(
    "http://localhost/api/integrations/mailboxes/mailbox-1/test",
    {
      method: "POST",
      headers: { origin: "http://localhost" }
    }
  );
}

const configuredStatusWhere = {
  id: "mailbox-1",
  configurationVersion: 7,
  encryptedConfig: { not: null },
  configurationDeletedAt: null
};

describe("mailbox connection test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "admin-1", role: "ADMIN" }
    });
    mocks.getMailboxRuntimeConfig.mockResolvedValue({
      emailAddress: "support@example.test"
    });
    mocks.getMailboxRuntimeConfiguration.mockResolvedValue({
      config: { emailAddress: "support@example.test" },
      configurationVersion: 7
    });
    mocks.update.mockResolvedValue({ id: "mailbox-1" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.classifyMailSyncError.mockReturnValue(
      "IMAP_CONNECTION_TIMEOUT"
    );
  });

  it("conditions a successful status write on the tested configuration", async () => {
    const testConnection = vi.fn().mockResolvedValue({ ok: true });
    mocks.createSmtpImapAdapter.mockReturnValue({
      testConnection
    });
    const { POST } = await import(
      "@/app/api/integrations/mailboxes/[id]/test/route"
    );

    const response = await POST(request(), {
      params: Promise.resolve({ id: "mailbox-1" })
    });

    expect(response.status).toBe(200);
    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: configuredStatusWhere,
      data: {
        lastTestedAt: expect.any(Date),
        lastSuccessAt: expect.any(Date),
        lastErrorCode: null
      }
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("conditions a failed status write on the tested configuration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createSmtpImapAdapter.mockReturnValue({
      testConnection: vi
        .fn()
        .mockRejectedValue(new Error("connection failed"))
    });
    const { POST } = await import(
      "@/app/api/integrations/mailboxes/[id]/test/route"
    );

    const response = await POST(request(), {
      params: Promise.resolve({ id: "mailbox-1" })
    });

    expect(response.status).toBe(502);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: configuredStatusWhere,
      data: {
        lastTestedAt: expect.any(Date),
        lastErrorCode: "IMAP_CONNECTION_TIMEOUT"
      }
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
