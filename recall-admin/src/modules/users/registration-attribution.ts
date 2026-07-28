import type { GeoIpResolver } from "@/modules/geoip/types";
import {
  resolveOperationalLocation,
  type AttributionResult,
  type IpLocationSource
} from "@/modules/location/attribution";
import type { LocationRule } from "@/modules/location/email-domain";

export type RegistrationAttributionInput = {
  email: string;
  registration_ip?: string;
  country_code?: string;
  region?: string;
};

export async function resolveRegistrationAttribution(
  input: RegistrationAttributionInput,
  resolver: GeoIpResolver,
  rules: LocationRule[]
): Promise<AttributionResult> {
  let resolved:
    | {
        countryCode: string | null;
        region: string | null;
        source: IpLocationSource;
      }
    | null = null;

  if (input.registration_ip) {
    try {
      const location = await resolver.resolve(input.registration_ip);
      if (location?.countryCode) {
        resolved = {
          countryCode: location.countryCode,
          region: location.region,
          source: location.source ?? "IP_GEOIP"
        };
      }
    } catch {
      // Registration must continue; trusted event data can still be used.
    }
  }

  if (!resolved && input.country_code) {
    resolved = {
      countryCode: input.country_code.toUpperCase(),
      region: input.region ?? null,
      source: "IP_EVENT"
    };
  }

  return resolveOperationalLocation({
    email: input.email,
    rules,
    ipLocation: resolved
  });
}

