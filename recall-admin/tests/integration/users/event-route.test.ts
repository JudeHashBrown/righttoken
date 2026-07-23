import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createRightTokenEventHandler } from "@/modules/integrations/righttoken-event-handler";
import { noopTaskScheduler } from "@/modules/tasks/scheduler";
import { ingestUserEvent } from "@/modules/users/apply-event";

const currentSecret = "integration-internal-secret-current-32";
const previousSecret = "integration-internal-secret-previous-32";
const externalUserIds: string[] = [];

const handler = createRightTokenEventHandler({
  getSecrets: () => ({
    current: currentSecret,
    previous: previousSecret
  }),
  getScheduler: async () => noopTaskScheduler,
  ingestEvent: ingestUserEvent
});

function request(
  body: unknown,
  authorization?: string
): NextRequest {
  return new NextRequest(
    "http://127.0.0.1:3000/api/internal/righttoken/events",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? { authorization } : {})
      },
      body: JSON.stringify(body)
    }
  );
}

describe("RightToken internal event route", () => {
  afterAll(async () => {
    await prisma.userProfile.deleteMany({
      where: { externalUserId: { in: externalUserIds } }
    });
    await prisma.$disconnect();
  });

  it("rejects requests without the internal bearer token", async () => {
    const response = await handler(request({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "UNAUTHORIZED"
    });
  });

  it("rejects an invalid event without returning schema details", async () => {
    const response = await handler(
      request(
        { event_type: "unknown" },
        `Bearer ${currentSecret}`
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_EVENT"
    });
  });

  it("ingests one registration and treats a replay as a duplicate", async () => {
    const externalUserId = `route-user-${randomUUID()}`;
    const eventId = `route-event-${randomUUID()}`;
    externalUserIds.push(externalUserId);
    const event = {
      event_id: eventId,
      event_type: "user.registered",
      occurred_at: "2026-07-23T12:00:00.000Z",
      user_id: externalUserId,
      payload: {
        email: `${externalUserId}@example.test`,
        country_code: "SG"
      }
    };

    const first = await handler(
      request(event, `Bearer ${currentSecret}`)
    );
    const second = await handler(
      request(event, `Bearer ${previousSecret}`)
    );

    expect(first.status).toBe(202);
    await expect(first.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      currentSegment: "A"
    });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      currentSegment: "A"
    });
    expect(
      await prisma.userEvent.count({ where: { eventId } })
    ).toBe(1);
    expect(
      await prisma.userProfile.count({
        where: { externalUserId }
      })
    ).toBe(1);
  });

  it("returns a sanitized unavailable response for ingestion failures", async () => {
    const failingHandler = createRightTokenEventHandler({
      getSecrets: () => ({ current: currentSecret }),
      getScheduler: async () => noopTaskScheduler,
      ingestEvent: async () => {
        throw new Error(
          "postgresql://private-user:private-password@recall-db"
        );
      }
    });
    const response = await failingHandler(
      request(
        {
          event_id: "failure-event",
          event_type: "user.registered",
          occurred_at: "2026-07-23T12:00:00.000Z",
          user_id: "failure-user",
          payload: { email: "failure-user@example.test" }
        },
        `Bearer ${currentSecret}`
      )
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("EVENT_INGESTION_UNAVAILABLE");
    expect(body).not.toContain("private-password");
  });
});
