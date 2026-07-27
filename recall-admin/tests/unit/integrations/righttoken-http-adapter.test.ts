import { describe, expect, it, vi } from "vitest";
import { createRightTokenHttpAdapter } from "@/modules/integrations/righttoken/http-adapter";

describe("RightToken HTTP adapter", () => {
  it("uses bearer authentication and validates paged snapshots", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          users: [
            {
              externalUserId: "RT-100",
              email: "rt-100@example.test",
              displayName: null,
              registeredAt: "2026-07-23T00:00:00.000Z",
              updatedAt: "2026-07-24T00:00:00.000Z",
              registrationIp: null,
              countryCode: "SG",
              region: null,
              language: null,
              timezone: null,
              source: null,
              checkoutStartedAt: null,
              firstPaidAt: null,
              totalPaidMinor: 0,
              successfulCallCount: 0,
              lastCallAt: null,
              balanceMinor: 0,
              anomalyActive: false
            }
          ],
          nextCursor: "next-page"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    const adapter = createRightTokenHttpAdapter(
      {
        mode: "http",
        baseUrl: "https://righttoken.example",
        apiToken: "test-recall-export-token-at-least-32-characters"
      },
      fetchMock
    );

    const result = await adapter.listUsers({
      updatedAfter: new Date("2026-07-24T00:00:00.000Z"),
      cursor: "cursor-1",
      limit: 200
    });

    expect(result.users[0]?.updatedAt).toBeInstanceOf(Date);
    expect(result.nextCursor).toBe("next-page");
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(
      "/api/v1/admin/recall/users"
    );
    expect(String(url)).toContain("updated_after=");
    expect(String(url)).toContain("cursor=cursor-1");
    expect(options.headers.authorization).toBe(
      "Bearer test-recall-export-token-at-least-32-characters"
    );
  });
});
