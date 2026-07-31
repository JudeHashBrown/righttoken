import { describe, expect, it, vi } from "vitest";
import {
  getVisitDashboard,
  type VisitQuerySource
} from "@/modules/visits/queries";

describe("site visit dashboard queries", () => {
  it("returns global distinct totals and fills missing Shanghai days", async () => {
    const source: VisitQuerySource = {
      totals: vi
        .fn()
        .mockResolvedValueOnce({ uv: 2, pv: 3 })
        .mockResolvedValueOnce({ uv: 3, pv: 7 }),
      daily: vi.fn().mockResolvedValue([
        {
          date: new Date("2026-07-30T00:00:00.000Z"),
          uv: 2,
          pv: 4
        },
        {
          date: new Date("2026-07-31T00:00:00.000Z"),
          uv: 2,
          pv: 3
        }
      ]),
      countries: vi.fn().mockResolvedValue([
        { countryCode: "US", uv: 1, pv: 2 },
        { countryCode: "CN", uv: 2, pv: 4 },
        { countryCode: "ZZ", uv: 1, pv: 1 }
      ]),
      chinaRegions: vi.fn().mockResolvedValue([
        { region: "北京", uv: 1, pv: 1 },
        { region: "广东", uv: 2, pv: 3 }
      ])
    };

    const result = await getVisitDashboard(
      7,
      new Date("2026-07-31T08:00:00.000Z"),
      source
    );

    expect(result.today).toEqual({ uv: 2, pv: 3 });
    expect(result.period).toEqual({ uv: 3, pv: 7 });
    expect(result.daily).toHaveLength(7);
    expect(result.daily[0]).toEqual({
      date: "2026-07-25",
      uv: 0,
      pv: 0
    });
    expect(result.daily.at(-1)).toEqual({
      date: "2026-07-31",
      uv: 2,
      pv: 3
    });
    expect(result.countries.map((row) => row.countryCode)).toEqual([
      "CN",
      "US",
      "ZZ"
    ]);
    expect(result.countries[0]).toMatchObject({
      name: "中国大陆",
      uv: 2,
      pv: 4
    });
    expect(result.chinaRegions.map((row) => row.region)).toEqual([
      "广东",
      "北京"
    ]);
  });

  it("uses one bounded interval for every period geography query", async () => {
    const source: VisitQuerySource = {
      totals: vi.fn().mockResolvedValue({ uv: 0, pv: 0 }),
      daily: vi.fn().mockResolvedValue([]),
      countries: vi.fn().mockResolvedValue([]),
      chinaRegions: vi.fn().mockResolvedValue([])
    };

    await getVisitDashboard(
      30,
      new Date("2026-07-31T16:30:00.000Z"),
      source
    );

    const expectedStart = new Date("2026-07-03T00:00:00.000Z");
    const expectedEnd = new Date("2026-08-02T00:00:00.000Z");
    expect(source.daily).toHaveBeenCalledWith(
      expectedStart,
      expectedEnd
    );
    expect(source.countries).toHaveBeenCalledWith(
      expectedStart,
      expectedEnd
    );
    expect(source.chinaRegions).toHaveBeenCalledWith(
      expectedStart,
      expectedEnd
    );
  });
});
