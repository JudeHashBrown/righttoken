import { resolveOperationalLocation } from "@/modules/location/attribution";
import type { LocationRule } from "@/modules/location/email-domain";

export type LocationPreviewUser = {
  email: string;
  countryCode: string | null;
  ipCountryCode: string | null;
  ipRegion: string | null;
};

export type LocationRulePreview = {
  totalUsers: number;
  changedUsers: number;
  countsByCountry: Record<string, number>;
};

export function previewLocationRules(
  users: LocationPreviewUser[],
  rules: LocationRule[]
): LocationRulePreview {
  let changedUsers = 0;
  const countsByCountry: Record<string, number> = {};

  for (const user of users) {
    const result = resolveOperationalLocation({
      email: user.email,
      rules,
      ipLocation:
        user.ipCountryCode || user.countryCode
          ? {
              countryCode: user.ipCountryCode ?? user.countryCode,
              region: user.ipRegion,
              source: "IP_GEOIP"
            }
          : null
    });
    if (result.countryCode !== user.countryCode) {
      changedUsers += 1;
    }
    const country = result.countryCode ?? "未识别";
    countsByCountry[country] =
      (countsByCountry[country] ?? 0) + 1;
  }

  return {
    totalUsers: users.length,
    changedUsers,
    countsByCountry
  };
}

