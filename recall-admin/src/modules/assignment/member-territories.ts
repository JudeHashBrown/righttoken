import type { AssignmentRuleInput } from "@/modules/assignment/types";

export type MemberTerritory = {
  countryCode: string;
  regions: string[];
};

function normalizedTerritory(
  territory: MemberTerritory
): MemberTerritory {
  return {
    countryCode: territory.countryCode.trim().toUpperCase(),
    regions: [
      ...new Set(
        territory.regions
          .map((region) => region.trim())
          .filter(Boolean)
      )
    ]
  };
}

export function territoriesForMember(
  memberId: string,
  rules: AssignmentRuleInput[]
): MemberTerritory[] {
  const byCountry = new Map<string, Set<string>>();
  for (const rule of rules) {
    if (
      !rule.memberTerritoryManaged ||
      rule.assigneeId !== memberId
    ) {
      continue;
    }
    for (const countryCode of rule.conditions.countryCodes ?? []) {
      const normalizedCountry = countryCode.trim().toUpperCase();
      if (!normalizedCountry) continue;
      const regions =
        byCountry.get(normalizedCountry) ?? new Set<string>();
      for (const region of rule.conditions.regionIncludes ?? []) {
        const normalizedRegion = region.trim();
        if (normalizedRegion) regions.add(normalizedRegion);
      }
      byCountry.set(normalizedCountry, regions);
    }
  }
  return [...byCountry.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([countryCode, regions]) => ({
      countryCode,
      regions: [...regions]
    }));
}

export function assertNoTerritoryConflict(
  rules: AssignmentRuleInput[]
): void {
  const owners = new Map<string, string>();
  for (const rule of rules) {
    if (!rule.memberTerritoryManaged || !rule.assigneeId) {
      continue;
    }
    const countries = rule.conditions.countryCodes ?? [];
    const regions = rule.conditions.regionIncludes?.length
      ? rule.conditions.regionIncludes
      : ["*"];
    for (const country of countries) {
      for (const region of regions) {
        const key =
          `${country.trim().toUpperCase()}:` +
          region.trim().toLocaleLowerCase();
        const owner = owners.get(key);
        if (owner && owner !== rule.assigneeId) {
          throw new Error("TERRITORY_CONFLICT");
        }
        owners.set(key, rule.assigneeId);
      }
    }
  }
}

export function mergeMemberTerritories(
  memberId: string,
  territories: MemberTerritory[],
  rules: AssignmentRuleInput[]
): AssignmentRuleInput[] {
  const kept = rules.filter(
    (rule) =>
      !rule.memberTerritoryManaged ||
      rule.assigneeId !== memberId
  );
  const generated = territories
    .map(normalizedTerritory)
    .filter(
      (territory) => /^[A-Z]{2}$/.test(territory.countryCode)
    )
    .map(
      (territory): AssignmentRuleInput => ({
        name: `${territory.countryCode} 运营负责人`,
        enabled: true,
        memberTerritoryManaged: true,
        priority: 0,
        conditions: {
          countryCodes: [territory.countryCode],
          ...(territory.regions.length
            ? { regionIncludes: territory.regions }
            : {})
        },
        assigneeId: memberId,
        fallbackAssigneeId: null,
        poolKey: null,
        workloadLimit: null,
        effectiveFrom: null,
        effectiveTo: null
      })
    );
  const merged = [...kept, ...generated].map((rule, index) => ({
    ...rule,
    priority: index + 1
  }));
  assertNoTerritoryConflict(merged);
  return merged;
}
