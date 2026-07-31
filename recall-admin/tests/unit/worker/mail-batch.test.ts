import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processMailBatch: vi.fn()
}));

vi.mock("@/modules/mail/process-mail-batch", () => ({
  processMailBatch: mocks.processMailBatch
}));

describe("mail batch worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.processMailBatch.mockResolvedValue({
      completed: true,
      sent: 1,
      skipped: 0,
      failed: 0
    });
  });

  it("passes one already-resolved adapter to the bounded processor", async () => {
    const { handleMailBatch } = await import(
      "@/worker/handlers/mail-batch"
    );
    const adapter = { send: vi.fn() };
    const scheduler = {
      scheduleSegmentCheck: vi.fn(),
      scheduleMailBatch: vi.fn()
    };
    const now = new Date("2026-07-30T10:00:00.000Z");

    await handleMailBatch(
      { batchId: "batch-1" },
      now,
      scheduler,
      { adapter },
      10
    );

    expect(mocks.processMailBatch).toHaveBeenCalledWith(
      { batchId: "batch-1" },
      now,
      scheduler,
      { adapter },
      10
    );
  });
});
