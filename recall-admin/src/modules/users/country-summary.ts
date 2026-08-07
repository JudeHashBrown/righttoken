import { prisma } from "@/lib/db/prisma";
import { presentCountry } from "@/modules/visits/geography";

export type UserCountrySummarySource = {
  rows(): Promise<Array<{ countryCode: string | null; users: number }>>;
};

export type UserCountrySummary = {
  total: number;
  countries: Array<{ countryCode: string; name: string; users: number }>;
};

const prismaUserCountrySummarySource: UserCountrySummarySource = {
  async rows() {
    const rows = await prisma.userProfile.groupBy({
      where: { sourceDeletedAt: null },
      by: ["countryCode"],
      _count: { _all: true }
    });
    return rows.map((row) => ({
      countryCode: row.countryCode,
      users: row._count._all
    }));
  }
};

function normalize(value: string | null): string {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/u.test(code) ? code : "ZZ";
}

export async function getUserCountrySummary(
  source: UserCountrySummarySource = prismaUserCountrySummarySource
): Promise<UserCountrySummary> {
  const merged = new Map<string, number>();
  for (const row of await source.rows()) {
    const countryCode = normalize(row.countryCode);
    merged.set(countryCode, (merged.get(countryCode) ?? 0) + row.users);
  }
  const countries = [...merged]
    .map(([countryCode, users]) => ({
      countryCode,
      name: presentCountry(countryCode),
      users
    }))
    .sort(
      (left, right) =>
        right.users - left.users ||
        left.countryCode.localeCompare(right.countryCode)
    );

  return {
    total: countries.reduce((sum, country) => sum + country.users, 0),
    countries
  };
}
