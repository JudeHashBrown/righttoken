import { describe, expect, it, vi } from "vitest";

import { createRightTokenDatabaseAdapter } from "@/modules/integrations/righttoken/database-adapter";

const firstRow = {
  id: 42n,
  email: "operator@example.com",
  display_name: "Operator",
  registered_at: new Date("2026-07-01T00:00:00.000Z"),
  effective_updated_at: new Date("2026-07-02T00:00:00.000Z"),
  deleted_at: null,
  registration_ip: "203.0.113.9",
  checkout_started_at: null,
  first_paid_at: null,
  total_paid_minor: 0n,
  successful_call_count: 3n,
  last_call_at: new Date("2026-07-02T00:00:00.000Z"),
  balance_minor: 250n,
  anomaly_active: true,
  anomaly_changed_at: new Date("2026-07-02T00:15:00.000Z")
};

describe("RightToken database adapter", () => {
  it("returns normalized live RightToken facts", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [firstRow] });
    const adapter = createRightTokenDatabaseAdapter(query);

    const page = await adapter.listUsers({ limit: 10 });

    expect(page.users[0]).toMatchObject({
      externalUserId: "42",
      email: "operator@example.com",
      displayName: "Operator",
      registrationIp: "203.0.113.9",
      balanceMinor: 250,
      balanceCurrency: "USD",
      balanceUsdMinor: 250,
      successfulCallCount: 3,
      totalPaidCurrency: "USD",
      anomalyActive: true,
      anomalyChangedAt: new Date("2026-07-02T00:15:00.000Z")
    });
    expect(page.nextCursor).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("FROM public.users");
    expect(query.mock.calls[0]?.[0]).toContain("final_request_events AS");
    expect(query.mock.calls[0]?.[0]).toContain(
      "event.consecutive_successes >= 3"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "event.consecutive_failures >= 3"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "event.failure_count * 2 >= event.request_count"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "error_log.status_code >= 400"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "COALESCE(error_log.is_business_limited, false) = false"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "COALESCE(error_log.error_owner, 'platform') <> 'client'"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "'invalid_request_error'"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "'authentication_error'"
    );
    expect(query.mock.calls[0]?.[0]).toContain("'billing_error'");
    expect(query.mock.calls[0]?.[0]).toContain(
      "'subscription_error'"
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "NOW() - INTERVAL '24 hours'"
    );
    expect(query.mock.calls[0]?.[0]).not.toContain(
      "COALESCE(error_log.resolved, false) = false"
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      new Date(0),
      0n,
      11
    ]);
  });

  it("returns soft-deletion tombstones for reconciliation", async () => {
    const deletedAt = new Date("2026-07-05T00:00:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          ...firstRow,
          effective_updated_at: deletedAt,
          deleted_at: deletedAt
        }
      ]
    });
    const adapter = createRightTokenDatabaseAdapter(query);

    const page = await adapter.listUsers({ limit: 10 });

    expect(page.users[0]?.deletedAt).toEqual(deletedAt);
    expect(query.mock.calls[0]?.[0]).not.toContain(
      "WHERE u.deleted_at IS NULL"
    );
  });

  it("uses a deterministic cursor when another page exists", async () => {
    const secondRow = {
      ...firstRow,
      id: 43n,
      email: "next@example.com",
      effective_updated_at: new Date("2026-07-03T00:00:00.000Z")
    };
    const query = vi.fn().mockResolvedValue({
      rows: [firstRow, secondRow]
    });
    const firstAdapter = createRightTokenDatabaseAdapter(query);

    const firstPage = await firstAdapter.listUsers({ limit: 1 });

    expect(firstPage.users.map((user) => user.externalUserId)).toEqual([
      "42"
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const nextQuery = vi.fn().mockResolvedValue({ rows: [] });
    const nextAdapter = createRightTokenDatabaseAdapter(nextQuery);
    await nextAdapter.listUsers({
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined
    });
    expect(nextQuery.mock.calls[0]?.[1]).toEqual([
      new Date("2026-07-02T00:00:00.000Z"),
      42n,
      2
    ]);
  });

  it("rejects malformed cursors before querying", async () => {
    const query = vi.fn();
    const adapter = createRightTokenDatabaseAdapter(query);

    await expect(
      adapter.listUsers({ limit: 10, cursor: "not-a-cursor" })
    ).rejects.toThrow("RIGHTTOKEN_DATABASE_CURSOR_INVALID");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects database integers that cannot be represented safely", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        ...firstRow,
        successful_call_count: BigInt(Number.MAX_SAFE_INTEGER) + 1n
      }]
    });
    const adapter = createRightTokenDatabaseAdapter(query);

    await expect(adapter.listUsers({ limit: 10 })).rejects.toThrow(
      "RIGHTTOKEN_DATABASE_INTEGER_OUT_OF_RANGE"
    );
  });

  it("verifies the shared database connection", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] });
    const adapter = createRightTokenDatabaseAdapter(query);

    await expect(adapter.verifyConnection()).resolves.toEqual({
      ok: true,
      source: "righttoken-database"
    });
    expect(query).toHaveBeenCalledWith("SELECT 1 AS ok", []);
  });
});
