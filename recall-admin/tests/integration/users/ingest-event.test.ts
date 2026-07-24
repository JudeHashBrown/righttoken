import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import type {
  SegmentCheckSchedule,
  TaskScheduler
} from "@/modules/tasks/scheduler";
import { ingestUserEvent } from "@/modules/users/apply-event";

const externalUserIds: string[] = [];

function event(
  userId: string,
  eventType: string,
  occurredAt: string,
  payload: Record<string, unknown>,
  eventId: string = randomUUID()
) {
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: occurredAt,
    user_id: userId,
    payload
  };
}

describe("idempotent user event ingestion", () => {
  afterAll(async () => {
    await prisma.userProfile.deleteMany({
      where: { externalUserId: { in: externalUserIds } }
    });
    await prisma.$disconnect();
  });

  it("accepts a duplicate event ID only once", async () => {
    const userId = `duplicate-${randomUUID()}`;
    externalUserIds.push(userId);
    const eventId = `duplicate-event-${randomUUID()}`;
    const registered = event(
      userId,
      "user.registered",
      "2026-07-23T08:00:00.000Z",
      { email: `${userId}@example.test` },
      eventId
    );

    await expect(ingestUserEvent(registered)).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
      currentSegment: "A"
    });
    await expect(ingestUserEvent(registered)).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
      currentSegment: "A"
    });
    expect(
      await prisma.userEvent.count({ where: { eventId } })
    ).toBe(1);
  });

  it("schedules the A observation check two hours after registration", async () => {
    const userId = `scheduled-register-${randomUUID()}`;
    externalUserIds.push(userId);
    const scheduled: SegmentCheckSchedule[] = [];
    const scheduler: TaskScheduler = {
      async scheduleSegmentCheck(input) {
        scheduled.push(input);
      }
    };

    await ingestUserEvent(
      event(
        userId,
        "user.registered",
        "2026-07-23T08:00:00.000Z",
        { email: `${userId}@example.test` }
      ),
      scheduler
    );

    expect(scheduled).toEqual([
      {
        userId: expect.any(String),
        expectedSegment: "A",
        expectedFactTimestamp: "2026-07-23T08:00:00.000Z",
        runAt: new Date("2026-07-23T10:00:00.000Z"),
        reasonKey: "registration_unpaid"
      }
    ]);
  });

  it("serializes concurrent events for the same newly registered user", async () => {
    const userId = `concurrent-register-${randomUUID()}`;
    externalUserIds.push(userId);
    const firstEventId = `register-one-${randomUUID()}`;
    const secondEventId = `register-two-${randomUUID()}`;

    const results = await Promise.all([
      ingestUserEvent(
        event(
          userId,
          "user.registered",
          "2026-07-23T08:00:00.000Z",
          { email: `${userId}@example.test` },
          firstEventId
        )
      ),
      ingestUserEvent(
        event(
          userId,
          "user.registered",
          "2026-07-23T08:00:01.000Z",
          { email: `${userId}@example.test` },
          secondEventId
        )
      )
    ]);

    expect(results).toHaveLength(2);
    const profile = await prisma.userProfile.findUniqueOrThrow({
      where: { externalUserId: userId }
    });
    expect(
      await prisma.userEvent.count({
        where: {
          userId: profile.id,
          eventId: { in: [firstEventId, secondEventId] }
        }
      })
    ).toBe(2);
  });

  it("stores a stale balance event without overwriting newer state", async () => {
    const userId = `stale-balance-${randomUUID()}`;
    externalUserIds.push(userId);
    await ingestUserEvent(
      event(
        userId,
        "user.registered",
        "2026-07-23T08:00:00.000Z",
        { email: `${userId}@example.test` }
      )
    );
    await ingestUserEvent(
      event(
        userId,
        "balance.changed",
        "2026-07-23T10:00:00.000Z",
        {
          balance_minor: 44,
          balance_currency: "EUR",
          balance_usd_minor: 49
        }
      )
    );
    const staleEventId = `stale-event-${randomUUID()}`;
    await ingestUserEvent(
      event(
        userId,
        "balance.changed",
        "2026-07-23T09:00:00.000Z",
        { balance_minor: 100 },
        staleEventId
      )
    );

    const stored = await prisma.userProfile.findUniqueOrThrow({
      where: { externalUserId: userId }
    });
    expect(stored).toMatchObject({
      balanceMinor: 44,
      balanceCurrency: "EUR",
      balanceUsdMinor: 49
    });
    expect(
      (
        await prisma.userEvent.findUniqueOrThrow({
          where: { eventId: staleEventId }
        })
      ).applied
    ).toBe(false);
  });

  it("moves checkout B → paid C → successful call G with history", async () => {
    const userId = `journey-${randomUUID()}`;
    externalUserIds.push(userId);
    await ingestUserEvent(
      event(
        userId,
        "user.registered",
        "2026-07-23T08:00:00.000Z",
        { email: `${userId}@example.test` }
      )
    );
    await ingestUserEvent(
      event(
        userId,
        "checkout.started",
        "2026-07-23T09:00:00.000Z",
        { checkout_id: "checkout-test" }
      )
    );

    const paid = await ingestUserEvent(
      event(
        userId,
        "payment.succeeded",
        "2026-07-23T10:00:00.000Z",
        { payment_id: "payment-test", amount_minor: 5_000 }
      )
    );
    expect(paid).toMatchObject({
      duplicate: false,
      previousSegment: "B",
      currentSegment: "C"
    });

    const called = await ingestUserEvent(
      event(
        userId,
        "api_call.succeeded",
        "2026-07-23T10:05:00.000Z",
        { call_id: "call-test" }
      )
    );
    expect(called).toMatchObject({
      previousSegment: "C",
      currentSegment: "G"
    });

    const profile = await prisma.userProfile.findUniqueOrThrow({
      where: { externalUserId: userId }
    });
    expect(profile.currentSegment).toBe("G");
    expect(profile.successfulCallCount).toBe(1);
    expect(
      await prisma.segmentHistory.count({
        where: { userId: profile.id, toSegment: { in: ["C", "G"] } }
      })
    ).toBe(2);
  });

  it("keeps F active until an explicit recovery event", async () => {
    const userId = `anomaly-${randomUUID()}`;
    externalUserIds.push(userId);
    await ingestUserEvent(
      event(
        userId,
        "user.registered",
        "2026-07-23T08:00:00.000Z",
        { email: `${userId}@example.test` }
      )
    );
    await expect(
      ingestUserEvent(
        event(
          userId,
          "service.anomaly",
          "2026-07-23T09:00:00.000Z",
          { reason: "synthetic outage" }
        )
      )
    ).resolves.toMatchObject({ currentSegment: "F" });
    await expect(
      ingestUserEvent(
        event(
          userId,
          "service.recovered",
          "2026-07-23T09:30:00.000Z",
          {}
        )
      )
    ).resolves.toMatchObject({ currentSegment: "A" });
  });
});
