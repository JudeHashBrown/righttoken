import { describe, expect, it } from "vitest";
import { createRightTokenSimulator } from "@/modules/integrations/righttoken/simulator";

describe("RightToken adapter contract", () => {
  it("provides deterministic bounded pages without real user data", async () => {
    const adapter = createRightTokenSimulator();
    await expect(adapter.verifyConnection()).resolves.toEqual({
      ok: true,
      source: "righttoken-simulator"
    });

    const first = await adapter.listUsers({ limit: 25 });
    const repeated = await adapter.listUsers({ limit: 25 });
    expect(repeated).toEqual(first);
    expect(first.users).toHaveLength(25);
    expect(first.nextCursor).toBe("25");
    expect(new Set(first.users.map((user) => user.externalUserId)).size).toBe(
      25
    );
    for (const user of first.users) {
      expect(user.email).toMatch(/@example\.test$/);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(Number.isInteger(user.balanceMinor)).toBe(true);
    }
  });

  it("caps every page at 500 rows", async () => {
    const adapter = createRightTokenSimulator();
    const page = await adapter.listUsers({ limit: 5_000 });
    expect(page.users.length).toBeLessThanOrEqual(500);
  });
});
