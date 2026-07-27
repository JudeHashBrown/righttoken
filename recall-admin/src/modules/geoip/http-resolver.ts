import { z } from "zod";
import { isPublicIp } from "@/modules/geoip/private-ip";
import { MmdbGeoIpResolver } from "@/modules/geoip/mmdb-resolver";
import { LazyRirGeoIpResolver } from "@/modules/geoip/rir-resolver";
import { FallbackGeoIpResolver } from "@/modules/geoip/resolver-chain";
import type {
  GeoIpLocation,
  GeoIpResolver
} from "@/modules/geoip/types";

const responseSchema = z.object({
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .nullable()
    .default(null),
  region: z.string().trim().min(1).max(160).nullable().default(null)
});

type HttpGeoIpConfig = {
  url: string;
  token?: string;
  timeoutMs: number;
};

type GeoIpEnvironment = {
  GEOIP_HTTP_URL?: string;
  GEOIP_HTTP_TOKEN?: string;
  GEOIP_HTTP_TIMEOUT_MS?: string;
  GEOIP_MMDB_PATH?: string;
  GEOIP_RIR_PATH?: string;
};

class DisabledGeoIpResolver implements GeoIpResolver {
  async resolve(): Promise<null> {
    return null;
  }
}

export class HttpGeoIpResolver implements GeoIpResolver {
  constructor(
    private readonly config: HttpGeoIpConfig,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async resolve(ip: string): Promise<GeoIpLocation | null> {
    if (!isPublicIp(ip)) return null;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );
    try {
      const response = await this.fetcher(
        this.config.url.replace("{ip}", encodeURIComponent(ip)),
        {
          headers: this.config.token
            ? { authorization: `Bearer ${this.config.token}` }
            : {},
          signal: controller.signal
        }
      );
      if (!response.ok) return null;
      const result = responseSchema.safeParse(await response.json());
      return result.success ? result.data : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createGeoIpResolver(
  environment?: GeoIpEnvironment
): GeoIpResolver {
  const source = environment ?? process.env;
  const url = source.GEOIP_HTTP_URL?.trim();
  const rawTimeout = Number(source.GEOIP_HTTP_TIMEOUT_MS ?? 2_000);
  const resolvers: GeoIpResolver[] = [];
  const mmdbPath = source.GEOIP_MMDB_PATH?.trim();
  const rirPath = source.GEOIP_RIR_PATH?.trim();
  if (mmdbPath) {
    resolvers.push(new MmdbGeoIpResolver(mmdbPath));
  }
  if (rirPath) {
    resolvers.push(new LazyRirGeoIpResolver(rirPath));
  }
  if (url) {
    resolvers.push(
      new HttpGeoIpResolver({
        url,
        token: source.GEOIP_HTTP_TOKEN?.trim() || undefined,
        timeoutMs:
          Number.isInteger(rawTimeout) && rawTimeout > 0
            ? rawTimeout
            : 2_000
      })
    );
  }
  if (resolvers.length === 0) return new DisabledGeoIpResolver();
  if (resolvers.length === 1) return resolvers[0]!;
  return new FallbackGeoIpResolver(resolvers);
}
