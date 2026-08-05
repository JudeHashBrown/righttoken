import "server-only";
import { access } from "node:fs/promises";

export type GeoIpRuntimeStatus = {
  kind: "city" | "country" | "remote" | "unavailable";
  provinceCapable: boolean;
};

type GeoIpRuntimeEnvironment = {
  GEOIP_MMDB_PATH?: string;
  GEOIP_RIR_PATH?: string;
  GEOIP_HTTP_URL?: string;
};

type Readable = (path: string) => Promise<boolean | void>;

async function isReadable(path: string, readable: Readable): Promise<boolean> {
  try {
    return (await readable(path)) !== false;
  } catch {
    return false;
  }
}

export async function getGeoIpRuntimeStatus(
  environment: GeoIpRuntimeEnvironment | NodeJS.ProcessEnv = process.env,
  readable: Readable = access
): Promise<GeoIpRuntimeStatus> {
  const mmdbPath = environment.GEOIP_MMDB_PATH?.trim();
  if (mmdbPath && (await isReadable(mmdbPath, readable))) {
    return { kind: "city", provinceCapable: true };
  }

  const rirPath = environment.GEOIP_RIR_PATH?.trim();
  if (rirPath && (await isReadable(rirPath, readable))) {
    return { kind: "country", provinceCapable: false };
  }

  if (environment.GEOIP_HTTP_URL?.trim()) {
    return { kind: "remote", provinceCapable: false };
  }

  return { kind: "unavailable", provinceCapable: false };
}
