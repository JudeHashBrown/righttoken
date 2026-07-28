import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCredential: vi.fn(),
  findMailbox: vi.fn(),
  findIntents: vi.fn(),
  sendIntent: vi.fn(),
  escalateDeadLetter: vi.fn(),
  createApp: vi.fn(),
  createRobot: vi.fn()
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    mailbox: { findFirst: mocks.findMailbox },
    notificationIntent: { findMany: mocks.findIntents }
  }
}));

vi.mock("@/modules/integrations/credential-store", () => ({
  getIntegrationCredential: mocks.getCredential
}));

vi.mock("@/modules/notifications/notification-service", () => ({
  sendNotificationIntent: mocks.sendIntent
}));

vi.mock("@/modules/notifications/dead-letter-escalation", () => ({
  createDeadLetterEscalationIntents:
    mocks.escalateDeadLetter
}));

vi.mock("@/modules/notifications/adapters/wecom-app", async () => {
  const { z } = await import("zod");
  return {
    wecomAppConfigSchema: z.object({
      corpId: z.string(),
      agentId: z.string(),
      secret: z.string()
    }),
    createWecomAppAdapter: mocks.createApp
  };
});

vi.mock(
  "@/modules/notifications/adapters/wecom-webhook",
  async () => {
    const { z } = await import("zod");
    return {
      wecomWebhookConfigSchema: z.object({
        webhookUrl: z.string()
      }),
      createWecomWebhookAdapter: mocks.createRobot
    };
  }
);

import { handleNotificationDelivery } from "@/worker/handlers/notification-delivery";

describe("notification delivery worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCredential.mockImplementation(async (kind: string) =>
      kind === "WECOM_APP"
        ? {
            corpId: "ww-test",
            agentId: "1000002",
            secret: "secret"
          }
        : { webhookUrl: "https://example.test/webhook" }
    );
    mocks.findMailbox.mockResolvedValue(null);
    mocks.createApp.mockReturnValue({ channel: "WECOM_APP" });
    mocks.createRobot.mockReturnValue({
      channel: "WECOM_ROBOT"
    });
    mocks.findIntents.mockResolvedValue([
      {
        id: "app-intent",
        channel: "WECOM_APP",
        status: "PENDING"
      },
      {
        id: "robot-intent",
        channel: "WECOM_ROBOT",
        status: "PENDING"
      }
    ]);
    mocks.sendIntent.mockResolvedValue({ status: "SENT" });
  });

  it("loads and delivers both WeCom application and robot channels", async () => {
    await expect(
      handleNotificationDelivery(
        new Date("2026-07-26T07:30:00.000Z")
      )
    ).resolves.toMatchObject({
      pending: 2,
      attempted: 2,
      sent: 2
    });

    expect(mocks.getCredential).toHaveBeenCalledWith("WECOM_APP");
    expect(mocks.getCredential).toHaveBeenCalledWith("WECOM_ROBOT");
    expect(mocks.sendIntent).toHaveBeenCalledWith(
      "app-intent",
      expect.objectContaining({
        WECOM_APP: expect.objectContaining({
          channel: "WECOM_APP"
        })
      }),
      new Date("2026-07-26T07:30:00.000Z")
    );
  });

  it("creates fallback intents when a delivery becomes dead-lettered", async () => {
    mocks.findIntents.mockResolvedValue([
      {
        id: "failed-app-intent",
        channel: "WECOM_APP",
        status: "FAILED"
      }
    ]);
    mocks.sendIntent.mockResolvedValue({
      status: "DEAD_LETTER"
    });

    await handleNotificationDelivery(
      new Date("2026-07-26T07:30:00.000Z")
    );

    expect(mocks.escalateDeadLetter).toHaveBeenCalledWith(
      "failed-app-intent",
      new Date("2026-07-26T07:30:00.000Z")
    );
  });
});
