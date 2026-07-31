import { createHmac } from "node:crypto";
import { z } from "zod";
import type { GeoIpResolver } from "@/modules/geoip/types";
import { normalizeVisitGeography } from "@/modules/visits/geography";
import { toShanghaiVisitDate } from "@/modules/visits/visit-date";

const MAX_PAST_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_AGE_MS = 5 * 60 * 1000;
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export const siteVisitInputSchema = z
  .object({
    eventId: z.uuid(),
    occurredAt: z.iso.datetime({ offset: true }),
    visitorId: z.string().min(32).max(128),
    ip: z.union([z.ipv4(), z.ipv6()]),
    path: z.string().startsWith("/").max(1_000)
  })
  .strict();

export type SiteVisitData = {
  eventId: string;
  occurredAt: Date;
  visitDate: Date;
  visitorHash: string;
  countryCode: string;
  region: string | null;
  path: string;
};

export type SiteVisitStore = {
  create(data: SiteVisitData): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
};

export type SiteVisitIngestDependencies = {
  now(): Date;
  hashKey: string;
  resolver: GeoIpResolver;
  store: SiteVisitStore;
};

let lastCleanupAt = 0;

function normalizePath(rawPath: string): string {
  const normalized = rawPath.split(/[?#]/, 1)[0] || "/";
  if (normalized.length > 500) {
    throw new Error("invalid visit path");
  }
  return normalized;
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function resolveGeography(
  resolver: GeoIpResolver,
  ip: string
) {
  try {
    return normalizeVisitGeography(await resolver.resolve(ip));
  } catch {
    return normalizeVisitGeography(null);
  }
}

async function maybeCleanup(
  dependencies: SiteVisitIngestDependencies,
  now: Date
): Promise<void> {
  if (now.getTime() - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now.getTime();
  await dependencies.store
    .deleteOlderThan(new Date(now.getTime() - RETENTION_MS))
    .catch(() => undefined);
}

export async function ingestSiteVisit(
  input: unknown,
  dependencies: SiteVisitIngestDependencies
): Promise<"created" | "duplicate"> {
  const parsed = siteVisitInputSchema.parse(input);
  const occurredAt = new Date(parsed.occurredAt);
  const now = dependencies.now();
  const ageMs = now.getTime() - occurredAt.getTime();
  if (ageMs > MAX_PAST_AGE_MS || ageMs < -MAX_FUTURE_AGE_MS) {
    throw new Error("visit timestamp outside accepted window");
  }

  const geography = await resolveGeography(
    dependencies.resolver,
    parsed.ip
  );
  const data: SiteVisitData = {
    eventId: parsed.eventId,
    occurredAt,
    visitDate: toShanghaiVisitDate(occurredAt),
    visitorHash: createHmac("sha256", dependencies.hashKey)
      .update(parsed.visitorId)
      .digest("hex"),
    countryCode: geography.countryCode,
    region: geography.region,
    path: normalizePath(parsed.path)
  };

  try {
    await dependencies.store.create(data);
  } catch (error) {
    if (isUniqueConflict(error)) return "duplicate";
    throw error;
  }
  await maybeCleanup(dependencies, now);
  return "created";
}
