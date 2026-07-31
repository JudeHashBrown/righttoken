import type { GeoIpLocation } from "@/modules/geoip/types";

const countryOverrides: Record<string, string> = {
  CN: "中国大陆",
  HK: "中国香港",
  MO: "中国澳门",
  TW: "中国台湾",
  ZZ: "未知"
};

const regionSuffixes = [
  "维吾尔自治区",
  "壮族自治区",
  "回族自治区",
  "特别行政区",
  "自治区",
  "省",
  "市"
];

const countryNames = new Intl.DisplayNames(["zh-CN"], {
  type: "region"
});

function normalizeCountryCode(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized)
    ? normalized
    : "ZZ";
}

function normalizeChinaRegion(
  value: string | null | undefined
): string | null {
  let normalized = value?.trim();
  if (!normalized) return null;
  for (const suffix of regionSuffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length).trim();
      break;
    }
  }
  return normalized || null;
}

export function normalizeVisitGeography(
  location: GeoIpLocation | null
): {
  countryCode: string;
  region: string | null;
} {
  const countryCode = normalizeCountryCode(location?.countryCode);
  return {
    countryCode,
    region:
      countryCode === "CN"
        ? normalizeChinaRegion(location?.region)
        : null
  };
}

export function presentCountry(countryCode: string): string {
  const normalized = normalizeCountryCode(countryCode);
  return (
    countryOverrides[normalized] ??
    countryNames.of(normalized) ??
    normalized
  );
}
