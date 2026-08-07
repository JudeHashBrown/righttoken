import { describe, expect, it, vi } from "vitest";
import { getUserCountrySummary } from "@/modules/users/country-summary";

describe("user country summary", () => {
  it("normalizes, merges and sorts active user attribution countries", async () => {
    const rows = vi.fn().mockResolvedValue([
      { countryCode: "GB", users: 1 },
      { countryCode: "sg", users: 3 },
      { countryCode: null, users: 2 },
      { countryCode: "invalid", users: 1 }
    ]);

    await expect(getUserCountrySummary({ rows })).resolves.toEqual({
      total: 7,
      countries: [
        { countryCode: "SG", name: "新加坡", users: 3 },
        { countryCode: "ZZ", name: "未知", users: 3 },
        { countryCode: "GB", name: "英国", users: 1 }
      ]
    });
  });
});
