import { prisma } from "@/lib/db/prisma";
import type { LocationRule } from "@/modules/location/email-domain";

export async function loadActiveLocationRules(): Promise<
  LocationRule[]
> {
  const rules = await prisma.locationAttributionRule.findMany({
    where: { enabled: true },
    orderBy: { priority: "asc" },
    select: {
      id: true,
      enabled: true,
      priority: true,
      matchType: true,
      pattern: true,
      countryCode: true
    }
  });
  return rules;
}

