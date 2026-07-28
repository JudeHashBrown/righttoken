import type {
  GeoIpLocation,
  GeoIpResolver
} from "@/modules/geoip/types";

type RegistrationLocationInput = {
  registration_ip?: string;
  country_code?: string;
  region?: string;
};

export async function resolveRegistrationLocation(
  input: RegistrationLocationInput,
  resolver: GeoIpResolver
): Promise<GeoIpLocation> {
  const countryCode = input.country_code?.trim().toUpperCase() || null;
  const region = input.region?.trim() || null;
  if ((countryCode && region) || !input.registration_ip) {
    return { countryCode, region };
  }

  try {
    const resolved = await resolver.resolve(input.registration_ip);
    return {
      countryCode: countryCode ?? resolved?.countryCode ?? null,
      region: region ?? resolved?.region ?? null
    };
  } catch {
    return { countryCode, region };
  }
}
