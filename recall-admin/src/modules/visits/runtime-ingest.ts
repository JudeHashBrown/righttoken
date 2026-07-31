import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env/runtime";
import { createGeoIpResolver } from "@/modules/geoip/http-resolver";
import { ingestSiteVisit } from "@/modules/visits/ingest";

export async function ingestRuntimeSiteVisit(
  input: unknown
): Promise<"created" | "duplicate"> {
  const env = getServerEnv();
  return ingestSiteVisit(input, {
    now: () => new Date(),
    hashKey: env.VISITOR_HASH_KEY,
    resolver: createGeoIpResolver(),
    store: {
      async create(data) {
        await prisma.siteVisit.create({ data });
      },
      async deleteOlderThan(cutoff) {
        const result = await prisma.siteVisit.deleteMany({
          where: { occurredAt: { lt: cutoff } }
        });
        return result.count;
      }
    }
  });
}
