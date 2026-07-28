import { open, type CityResponse } from "maxmind";
import { isPublicIp } from "@/modules/geoip/private-ip";
import type {
  GeoIpLocation,
  GeoIpResolver
} from "@/modules/geoip/types";

type MmdbCityRecord = {
  country?: { iso_code?: string };
  registered_country?: { iso_code?: string };
  subdivisions?: Array<{
    names?: { "zh-CN"?: string; en?: string };
  }>;
};

type MmdbReader = {
  get(ip: string): MmdbCityRecord | null | undefined;
};

export type MmdbReaderLoader = (
  path: string
) => Promise<MmdbReader>;

async function loadMmdbReader(path: string): Promise<MmdbReader> {
  const reader = await open<CityResponse>(path);
  return {
    get: (ip) => reader.get(ip)
  };
}

export class MmdbGeoIpResolver implements GeoIpResolver {
  private readerPromise: Promise<MmdbReader> | null = null;

  constructor(
    private readonly path: string,
    private readonly loadReader: MmdbReaderLoader = loadMmdbReader
  ) {}

  async resolve(ip: string): Promise<GeoIpLocation | null> {
    if (!isPublicIp(ip)) return null;
    try {
      this.readerPromise ??= this.loadReader(this.path);
      const record = (await this.readerPromise).get(ip);
      const countryCode = (
        record?.country?.iso_code ??
        record?.registered_country?.iso_code
      )
        ?.trim()
        .toUpperCase();
      if (!countryCode || countryCode.length !== 2) return null;
      const subdivision = record?.subdivisions?.[0]?.names;
      return {
        countryCode,
        region:
          subdivision?.["zh-CN"] ??
          subdivision?.en ??
          null,
        source: "IP_GEOIP"
      };
    } catch {
      this.readerPromise = null;
      return null;
    }
  }
}
