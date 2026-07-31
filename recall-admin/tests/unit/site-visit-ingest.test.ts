import { describe, expect, it, vi } from "vitest";
import { ingestSiteVisit } from "@/modules/visits/ingest";

const now = new Date("2026-07-31T08:00:00.000Z");
const input = {
  eventId: "c6a7a796-33c4-4cb3-9c0a-4504165d8c80",
  occurredAt: "2026-07-31T07:59:30.000Z",
  visitorId: "anonymous-visitor-id-that-is-long-enough",
  ip: "8.8.8.8",
  path: "/pricing?coupon=private#checkout"
};

describe("site visit ingestion", () => {
  it("stores only anonymous, normalized visit facts", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const result = await ingestSiteVisit(input, {
      now: () => now,
      hashKey: "visitor-hash-key-that-is-at-least-32-chars",
      resolver: {
        resolve: vi.fn().mockResolvedValue({
          countryCode: "CN",
          region: "广东省",
          source: "IP_GEOIP"
        })
      },
      store: {
        create,
        deleteOlderThan: vi.fn().mockResolvedValue(0)
      }
    });

    expect(result).toBe("created");
    expect(create).toHaveBeenCalledWith({
      eventId: input.eventId,
      occurredAt: new Date(input.occurredAt),
      visitDate: new Date("2026-07-31T00:00:00.000Z"),
      visitorHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      countryCode: "CN",
      region: "广东",
      path: "/pricing"
    });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("ip");
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty(
      "visitorId"
    );
  });

  it("keeps visits when GeoIP lookup is unavailable", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    await ingestSiteVisit(input, {
      now: () => now,
      hashKey: "visitor-hash-key-that-is-at-least-32-chars",
      resolver: {
        resolve: vi.fn().mockRejectedValue(new Error("offline"))
      },
      store: {
        create,
        deleteOlderThan: vi.fn().mockResolvedValue(0)
      }
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        countryCode: "ZZ",
        region: null
      })
    );
  });

  it("treats a repeated event ID as an idempotent duplicate", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "P2002"
    });
    const result = await ingestSiteVisit(input, {
      now: () => now,
      hashKey: "visitor-hash-key-that-is-at-least-32-chars",
      resolver: {
        resolve: vi.fn().mockResolvedValue(null)
      },
      store: {
        create: vi.fn().mockRejectedValue(duplicate),
        deleteOlderThan: vi.fn().mockResolvedValue(0)
      }
    });

    expect(result).toBe("duplicate");
  });

  it.each([
    {
      ...input,
      eventId: "not-a-uuid"
    },
    {
      ...input,
      ip: "not-an-ip"
    },
    {
      ...input,
      occurredAt: "2026-07-24T07:59:00.000Z"
    },
    {
      ...input,
      occurredAt: "2026-07-31T08:06:00.000Z"
    }
  ])("rejects malformed or implausible events", async (invalid) => {
    await expect(
      ingestSiteVisit(invalid, {
        now: () => now,
        hashKey: "visitor-hash-key-that-is-at-least-32-chars",
        resolver: { resolve: vi.fn().mockResolvedValue(null) },
        store: {
          create: vi.fn(),
          deleteOlderThan: vi.fn()
        }
      })
    ).rejects.toThrow();
  });
});
