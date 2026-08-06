import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { isPublicIp } from "@/modules/geoip/private-ip";
import type {
  GeoIpLocation,
  GeoIpResolver
} from "@/modules/geoip/types";

type IpVersion = 4 | 6;

type RirRange = {
  version: IpVersion;
  start: bigint;
  end: bigint;
  countryCode: string;
};

function ipv4ToBigInt(ip: string): bigint {
  return ip
    .split(".")
    .map(Number)
    .reduce((value, part) => (value << 8n) + BigInt(part), 0n);
}

function ipv6ToBigInt(ip: string): bigint {
  const normalized = ip.toLowerCase().split("%", 1)[0]!;
  const halves = normalized.split("::");
  if (halves.length > 2) throw new Error("invalid IPv6 address");

  const parseHalf = (half: string): string[] =>
    half ? half.split(":").filter(Boolean) : [];
  const left = parseHalf(halves[0] ?? "");
  const right = parseHalf(halves[1] ?? "");
  const missing = 8 - left.length - right.length;
  const groups =
    halves.length === 2
      ? [...left, ...Array(Math.max(0, missing)).fill("0"), ...right]
      : left;
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    throw new Error("invalid IPv6 address");
  }
  return groups.reduce(
    (value, group) => (value << 16n) + BigInt(`0x${group}`),
    0n
  );
}

function ipToBigInt(ip: string, version: IpVersion): bigint {
  return version === 4 ? ipv4ToBigInt(ip) : ipv6ToBigInt(ip);
}

function parseDelegatedRanges(text: string): RirRange[] {
  const ranges: RirRange[] = [];
  const ipv4Limit = 1n << 32n;
  const ipv6Limit = 1n << 128n;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const [registry, rawCountry, type, startIp, rawSize, , status] =
      line.split("|");
    if (
      !registry ||
      !/^[A-Z]{2}$/i.test(rawCountry ?? "") ||
      !startIp ||
      !rawSize ||
      !["allocated", "assigned"].includes(status?.toLowerCase() ?? "")
    ) {
      continue;
    }
    const version: IpVersion | null =
      type === "ipv4" ? 4 : type === "ipv6" ? 6 : null;
    if (!version || isIP(startIp) !== version) continue;

    const start = ipToBigInt(startIp, version);
    let end: bigint;
    if (version === 4) {
      if (!/^\d+$/.test(rawSize)) continue;
      const size = BigInt(rawSize);
      if (size <= 0n || start + size > ipv4Limit) continue;
      end = start + size - 1n;
    } else {
      if (!/^\d+$/.test(rawSize)) continue;
      const prefix = Number(rawSize);
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
        continue;
      }
      const size = 1n << BigInt(128 - prefix);
      if (start + size > ipv6Limit) continue;
      end = start + size - 1n;
    }
    ranges.push({
      version,
      start,
      end,
      countryCode: rawCountry!.toUpperCase()
    });
  }
  return ranges.sort(
    (left, right) =>
      left.version - right.version ||
      (left.start < right.start ? -1 : left.start > right.start ? 1 : 0)
  );
}

export class RirGeoIpResolver implements GeoIpResolver {
  private readonly rangesByVersion: Record<IpVersion, RirRange[]>;

  constructor(ranges: RirRange[]) {
    this.rangesByVersion = {
      4: ranges.filter((range) => range.version === 4),
      6: ranges.filter((range) => range.version === 6)
    };
  }

  static fromText(text: string): RirGeoIpResolver {
    return new RirGeoIpResolver(parseDelegatedRanges(text));
  }

  static async fromFile(path: string): Promise<RirGeoIpResolver> {
    return RirGeoIpResolver.fromText(await readFile(path, "utf8"));
  }

  hasRanges(): boolean {
    return (
      this.rangesByVersion[4].length > 0 ||
      this.rangesByVersion[6].length > 0
    );
  }

  async resolve(ip: string): Promise<GeoIpLocation | null> {
    if (!isPublicIp(ip)) return null;
    const version = isIP(ip) as IpVersion;
    const value = ipToBigInt(ip, version);
    const ranges = this.rangesByVersion[version];
    let low = 0;
    let high = ranges.length - 1;
    let candidate: RirRange | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const range = ranges[middle]!;
      if (range.start <= value) {
        candidate = range;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (!candidate || value > candidate.end) return null;
    return {
      countryCode: candidate.countryCode,
      region: null,
      source: "IP_RIR"
    };
  }
}

export class LazyRirGeoIpResolver implements GeoIpResolver {
  private resolverPromise: Promise<RirGeoIpResolver> | null = null;

  constructor(private readonly path: string) {}

  async resolve(ip: string): Promise<GeoIpLocation | null> {
    try {
      this.resolverPromise ??= RirGeoIpResolver.fromFile(this.path);
      return await (await this.resolverPromise).resolve(ip);
    } catch {
      this.resolverPromise = null;
      return null;
    }
  }
}
