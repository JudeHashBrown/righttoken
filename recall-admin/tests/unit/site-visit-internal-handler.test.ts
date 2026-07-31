import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { createSiteVisitHandler } from "@/modules/visits/internal-handler";

const secret = "internal-secret-that-is-at-least-32-characters";
const validBody = {
  eventId: "c6a7a796-33c4-4cb3-9c0a-4504165d8c80",
  occurredAt: "2026-07-31T07:59:30.000Z",
  visitorId: "anonymous-visitor-id-that-is-long-enough",
  ip: "8.8.8.8",
  path: "/pricing"
};

function request(
  body: unknown,
  authorization = `Bearer ${secret}`
): NextRequest {
  return new NextRequest(
    "http://localhost/api/internal/righttoken/visits",
    {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
}

describe("site visit internal handler", () => {
  it("rejects missing internal authorization", async () => {
    const handler = createSiteVisitHandler({
      getSecrets: () => ({ current: secret }),
      ingestVisit: vi.fn()
    });

    const response = await handler(request(validBody, ""));

    expect(response.status).toBe(401);
  });

  it("rejects an invalid body before ingestion", async () => {
    const ingestVisit = vi.fn();
    const handler = createSiteVisitHandler({
      getSecrets: () => ({ current: secret }),
      ingestVisit
    });

    const response = await handler(
      request({ ...validBody, ip: "not-an-ip" })
    );

    expect(response.status).toBe(400);
    expect(ingestVisit).not.toHaveBeenCalled();
  });

  it.each([
    ["created", 202],
    ["duplicate", 200]
  ] as const)("maps %s ingestion to %s", async (result, status) => {
    const handler = createSiteVisitHandler({
      getSecrets: () => ({ current: secret }),
      ingestVisit: vi.fn().mockResolvedValue(result)
    });

    const response = await handler(request(validBody));

    expect(response.status).toBe(status);
  });

  it("does not expose ingestion failures", async () => {
    const handler = createSiteVisitHandler({
      getSecrets: () => ({ current: secret }),
      ingestVisit: vi
        .fn()
        .mockRejectedValue(new Error("private 8.8.8.8 failure"))
    });

    const response = await handler(request(validBody));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("8.8.8.8");
  });
});
