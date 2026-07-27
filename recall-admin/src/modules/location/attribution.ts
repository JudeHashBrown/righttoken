import {
  matchEmailLocation,
  normalizeEmailDomain,
  type LocationRule
} from "@/modules/location/email-domain";

export type IpLocationSource = "IP_GEOIP" | "IP_RIR" | "IP_EVENT";

export type AttributionInput = {
  email: string;
  rules: LocationRule[];
  ipLocation: {
    countryCode: string | null;
    region: string | null;
    source: IpLocationSource;
  } | null;
};

export type AttributionResult = {
  countryCode: string | null;
  region: string | null;
  ipCountryCode: string | null;
  ipRegion: string | null;
  source:
    | "EMAIL_EXACT_DOMAIN"
    | "EMAIL_DOMAIN_SUFFIX"
    | IpLocationSource
    | "INVALID_REGISTRATION_DATA";
  ruleId: string | null;
};

export function resolveOperationalLocation(
  input: AttributionInput
): AttributionResult {
  const ipCountryCode =
    input.ipLocation?.countryCode?.toUpperCase() ?? null;
  const ipRegion = input.ipLocation?.region ?? null;
  const domain = normalizeEmailDomain(input.email);
  const emailMatch = domain
    ? matchEmailLocation(domain, input.rules)
    : null;

  if (emailMatch) {
    return {
      countryCode: emailMatch.countryCode,
      region: null,
      ipCountryCode,
      ipRegion,
      source: emailMatch.source,
      ruleId: emailMatch.ruleId
    };
  }

  if (ipCountryCode) {
    return {
      countryCode: ipCountryCode,
      region: ipRegion,
      ipCountryCode,
      ipRegion,
      source: input.ipLocation?.source ?? "IP_GEOIP",
      ruleId: null
    };
  }

  return {
    countryCode: null,
    region: null,
    ipCountryCode: null,
    ipRegion: null,
    source: "INVALID_REGISTRATION_DATA",
    ruleId: null
  };
}

