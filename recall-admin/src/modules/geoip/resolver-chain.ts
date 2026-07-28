import type {
  GeoIpLocation,
  GeoIpResolver
} from "@/modules/geoip/types";

export class FallbackGeoIpResolver implements GeoIpResolver {
  constructor(private readonly resolvers: GeoIpResolver[]) {}

  async resolve(ip: string): Promise<GeoIpLocation | null> {
    for (const resolver of this.resolvers) {
      try {
        const result = await resolver.resolve(ip);
        if (result?.countryCode) return result;
      } catch {
        // A broken local snapshot must not block registration.
      }
    }
    return null;
  }
}

