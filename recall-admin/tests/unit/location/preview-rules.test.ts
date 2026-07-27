import { describe, expect, it } from "vitest";
import { previewLocationRules } from "@/modules/location/preview-rules";

describe("location rule preview", () => {
  it("counts users whose operational country would change", () => {
    expect(
      previewLocationRules(
        [
          {
            email: "one@qq.com",
            countryCode: "RU",
            ipCountryCode: "RU",
            ipRegion: "Moscow"
          },
          {
            email: "two@gmail.com",
            countryCode: "HK",
            ipCountryCode: "HK",
            ipRegion: "Hong Kong"
          }
        ],
        [
          {
            id: "qq",
            enabled: true,
            priority: 1,
            matchType: "EXACT_DOMAIN",
            pattern: "qq.com",
            countryCode: "CN"
          }
        ]
      )
    ).toEqual({
      totalUsers: 2,
      changedUsers: 1,
      countsByCountry: { CN: 1, HK: 1 }
    });
  });
});
