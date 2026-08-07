import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { open, type CityResponse } from "maxmind";
import { RirGeoIpResolver } from "@/modules/geoip/rir-resolver";
import { isValidGeoIpHttpUrl } from "@/modules/geoip/source-contract";

export const defaultGeoIpMaxAgeDays = 45;
export const maximumGeoIpMaxAgeDays = 90;

export type GeoIpRuntimeStatus = {
  kind: "city" | "country" | "remote" | "unavailable";
  provinceCapable: boolean;
};

type GeoIpRuntimeEnvironment = {
  GEOIP_MMDB_PATH?: string;
  GEOIP_RIR_PATH?: string;
  GEOIP_HTTP_URL?: string;
  GEOIP_MAX_AGE_DAYS?: string;
};

type LocalFileMetadata = {
  isFile: boolean;
  size: number;
  mtimeMs: number;
};

export type GeoIpReadinessDependencies = {
  now: () => number;
  inspectFile: (path: string) => Promise<LocalFileMetadata>;
  validateMmdb: (path: string) => Promise<boolean | void>;
  validateRir: (path: string) => Promise<boolean | void>;
};

const defaultDependencies: GeoIpReadinessDependencies = {
  now: Date.now,
  inspectFile: async (path) => {
    await access(path, constants.R_OK);
    const metadata = await stat(path);
    return {
      isFile: metadata.isFile(),
      size: metadata.size,
      mtimeMs: metadata.mtimeMs
    };
  },
  validateMmdb: async (path) => {
    await open<CityResponse>(path);
  },
  validateRir: async (path) =>
    (await RirGeoIpResolver.fromFile(path)).hasRanges()
};

function parseMaxAgeDays(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") {
    return defaultGeoIpMaxAgeDays;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= maximumGeoIpMaxAgeDays
    ? value
    : null;
}

async function isUsableLocalFile(
  path: string,
  maxAgeDays: number,
  validate: (path: string) => Promise<boolean | void>,
  dependencies: GeoIpReadinessDependencies
): Promise<boolean> {
  try {
    const metadata = await dependencies.inspectFile(path);
    const ageMs = dependencies.now() - metadata.mtimeMs;
    if (
      !metadata.isFile ||
      metadata.size <= 0 ||
      !Number.isFinite(metadata.mtimeMs) ||
      ageMs < 0 ||
      ageMs > maxAgeDays * 24 * 60 * 60 * 1_000
    ) {
      return false;
    }
    return (await validate(path)) !== false;
  } catch {
    return false;
  }
}

export async function getGeoIpRuntimeStatus(
  environment: GeoIpRuntimeEnvironment | NodeJS.ProcessEnv = process.env,
  dependencyOverrides: Partial<GeoIpReadinessDependencies> = {}
): Promise<GeoIpRuntimeStatus> {
  const dependencies = {
    ...defaultDependencies,
    ...dependencyOverrides
  };
  const maxAgeDays = parseMaxAgeDays(environment.GEOIP_MAX_AGE_DAYS);
  if (maxAgeDays === null) {
    return { kind: "unavailable", provinceCapable: false };
  }

  const mmdbPath = environment.GEOIP_MMDB_PATH?.trim();
  if (
    mmdbPath &&
    (await isUsableLocalFile(
      mmdbPath,
      maxAgeDays,
      dependencies.validateMmdb,
      dependencies
    ))
  ) {
    return { kind: "city", provinceCapable: true };
  }

  const rirPath = environment.GEOIP_RIR_PATH?.trim();
  if (
    rirPath &&
    (await isUsableLocalFile(
      rirPath,
      maxAgeDays,
      dependencies.validateRir,
      dependencies
    ))
  ) {
    return { kind: "country", provinceCapable: false };
  }

  const remoteUrl = environment.GEOIP_HTTP_URL?.trim();
  if (remoteUrl && isValidGeoIpHttpUrl(remoteUrl)) {
    return { kind: "remote", provinceCapable: false };
  }

  return { kind: "unavailable", provinceCapable: false };
}
