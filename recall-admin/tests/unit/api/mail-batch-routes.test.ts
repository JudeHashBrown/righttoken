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
  class MailBatchNotFoundError extends Error {}
  class BounceRetryBatchError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    listMailBatches: vi.fn(),
    getMailBatchSummary: vi.fn(),
    retryMailBatch: vi.fn(),
    createBounceRetryBatch: vi.fn(),
    getRuntimeTaskScheduler: vi.fn(),
    UnauthorizedError,
    ForbiddenError,
    MailBatchNotFoundError,
    BounceRetryBatchError
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
vi.mock("@/modules/mail/mail-batch-query", () => ({
  listMailBatches: mocks.listMailBatches,
  getMailBatchSummary: mocks.getMailBatchSummary,
  MailBatchNotFoundError: mocks.MailBatchNotFoundError
}));
vi.mock("@/modules/mail/retry-mail-batch", () => ({
  retryMailBatch: mocks.retryMailBatch
}));
vi.mock("@/modules/mail/create-bounce-retry-batch", () => ({
  createBounceRetryBatch: mocks.createBounceRetryBatch,
  BounceRetryBatchError: mocks.BounceRetryBatchError
}));
vi.mock("@/modules/tasks/runtime-scheduler", () => ({
  getRuntimeTaskScheduler: mocks.getRuntimeTaskScheduler
}));

describe("mail batch query and retry routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "operator-1", role: "OPERATOR" }
    });
    mocks.getRuntimeTaskScheduler.mockResolvedValue({
      scheduleSegmentCheck: vi.fn(),
      scheduleMailBatch: vi.fn()
    });
  });

  it("lists safe batch summaries", async () => {
    mocks.listMailBatches.mockResolvedValue([
      {
        id: "batch-1",
        audienceLabel: "F 组全员",
        failedRecipients: 1
      }
    ]);
    const { GET } = await import(
      "@/app/api/mail/batches/route"
    );

    const response = await GET(
      new NextRequest("http://localhost/api/mail/batches")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      batches: [
        {
          id: "batch-1",
          audienceLabel: "F 组全员",
          failedRecipients: 1
        }
      ]
    });
  });

  it("returns one batch with safe reason aggregates", async () => {
    mocks.getMailBatchSummary.mockResolvedValue({
      id: "batch-1",
      reasons: [{ code: "SMTP_SEND_FAILED", count: 1 }]
    });
    const { GET } = await import(
      "@/app/api/mail/batches/[id]/route"
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/mail/batches/batch-1"
      ),
      { params: Promise.resolve({ id: "batch-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.getMailBatchSummary).toHaveBeenCalledWith(
      { id: "operator-1", role: "OPERATOR" },
      "batch-1"
    );
  });

  it("retries only through the server-side batch service", async () => {
    mocks.retryMailBatch.mockResolvedValue({
      id: "batch-1",
      status: "PENDING",
      pendingRecipients: 1,
      sentRecipients: 2,
      skippedRecipients: 1,
      failedRecipients: 0
    });
    const { POST } = await import(
      "@/app/api/mail/batches/[id]/retry/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/mail/batches/batch-1/retry",
        {
          method: "POST",
          headers: { origin: "http://localhost" }
        }
      ),
      { params: Promise.resolve({ id: "batch-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.retryMailBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "operator-1",
        batchId: "batch-1"
      })
    );
  });

  it("creates a confirmed final-bounce retry with an idempotency key", async () => {
    mocks.createBounceRetryBatch.mockResolvedValue({
      id: "retry-batch-1",
      status: "PENDING",
      totalRecipients: 2,
      pendingRecipients: 2
    });
    const { POST } = await import(
      "@/app/api/mail/batches/[id]/bounce-retry/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/mail/batches/batch-1/bounce-retry",
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "idempotency-key": "bounce-key-1"
          }
        }
      ),
      { params: Promise.resolve({ id: "batch-1" }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.assertSameOrigin).toHaveBeenCalled();
    expect(mocks.createBounceRetryBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "operator-1",
        batchId: "batch-1",
        idempotencyKey: "bounce-key-1"
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      id: "retry-batch-1",
      totalRecipients: 2
    });
  });

  it("rejects a final-bounce retry without actionable addresses", async () => {
    mocks.createBounceRetryBatch.mockRejectedValue(
      new mocks.BounceRetryBatchError(
        "NO_ACTIONABLE_BOUNCES"
      )
    );
    const { POST } = await import(
      "@/app/api/mail/batches/[id]/bounce-retry/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/mail/batches/batch-1/bounce-retry",
        {
          method: "POST",
          headers: {
            origin: "http://localhost",
            "idempotency-key": "bounce-key-2"
          }
        }
      ),
      { params: Promise.resolve({ id: "batch-1" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "NO_ACTIONABLE_BOUNCES"
    });
  });
});
