import type { GeoIpResolver } from "@/modules/geoip/types";
import {
  resolveOperationalLocation,
  type IpLocationSource
} from "@/modules/location/attribution";
import type { LocationRule } from "@/modules/location/email-domain";

export type StoredLocationUser = {
  email: string;
  registrationIp: string | null;
  ipCountryCode: string | null;
  ipRegion: string | null;
};

export async function recalculateStoredUserLocation(
  user: StoredLocationUser,
  rules: LocationRule[],
  resolver: GeoIpResolver
) {
  let ipLocation: {
    countryCode: string | null;
    region: string | null;
    source: IpLocationSource;
  } | null = user.ipCountryCode
    ? {
        countryCode: user.ipCountryCode,
        region: user.ipRegion,
        source: "IP_GEOIP" as const
      }
    : null;

  if (!ipLocation && user.registrationIp) {
    try {
      const resolved = await resolver.resolve(user.registrationIp);
      if (resolved?.countryCode) {
        ipLocation = {
          countryCode: resolved.countryCode,
          region: resolved.region,
          source: resolved.source ?? "IP_GEOIP"
        };
      }
    } catch {
      // The batch records the unresolved user without stopping others.
    }
  }

  return resolveOperationalLocation({
    email: user.email,
    rules,
    ipLocation
  });
}
