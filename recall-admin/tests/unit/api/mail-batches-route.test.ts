import { NextRequest } from "next/server";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  class MailBatchCreationError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  class OutboundMailAssetError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    createMailBatch: vi.fn(),
    getRuntimeTaskScheduler: vi.fn(),
    UnauthorizedError,
    ForbiddenError,
    MailBatchCreationError,
    OutboundMailAssetError
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
vi.mock("@/modules/mail/create-mail-batch", () => ({
  createMailBatch: mocks.createMailBatch,
  MailBatchCreationError: mocks.MailBatchCreationError
}));
vi.mock("@/modules/mail/outbound-assets", () => ({
  OutboundMailAssetError: mocks.OutboundMailAssetError
}));
vi.mock("@/modules/tasks/runtime-scheduler", () => ({
  getRuntimeTaskScheduler: mocks.getRuntimeTaskScheduler
}));

function request(
  body: unknown,
  idempotencyKey = "mail-batch-request-1"
): NextRequest {
  return new NextRequest(
    "http://localhost/api/mail/batches",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify(body)
    }
  );
}

const validBody = {
  mode: "SEGMENT",
  segment: "F",
  mailboxId: "mailbox-1",
  subject: "服务提醒",
  bodyText: "请查看服务说明。",
  bodyHtml: "<p>请查看服务说明。</p>",
  assets: []
};

describe("mail batch creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "operator-1", role: "OPERATOR" }
    });
    mocks.getRuntimeTaskScheduler.mockResolvedValue({
      scheduleSegmentCheck: vi.fn(),
      scheduleMailBatch: vi.fn()
    });
    mocks.createMailBatch.mockResolvedValue({
      id: "batch-1",
      status: "PENDING",
      totalRecipients: 12,
      pendingRecipients: 10,
      sentRecipients: 0,
      skippedRecipients: 2,
      failedRecipients: 0
    });
  });

  it("creates a safe server-resolved segment batch", async () => {
    const { POST } = await import(
      "@/app/api/mail/batches/route"
    );

    const response = await POST(request(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.createMailBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "operator-1",
        audience: { mode: "SEGMENT", segment: "F" },
        idempotencyKey: "mail-batch-request-1"
      })
    );
    expect(body).toEqual({
      id: "batch-1",
      status: "PENDING",
      totalRecipients: 12,
      pendingRecipients: 10,
      sentRecipients: 0,
      skippedRecipients: 2,
      failedRecipients: 0
    });
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("rejects missing idempotency and invalid audience input", async () => {
    const { POST } = await import(
      "@/app/api/mail/batches/route"
    );

    const missingKey = await POST(request(validBody, ""));
    const invalidAudience = await POST(
      request({ ...validBody, mode: "ALL", segment: "F" })
    );

    expect(missingKey.status).toBe(400);
    expect(invalidAudience.status).toBe(400);
    expect(mocks.createMailBatch).not.toHaveBeenCalled();
  });
});
