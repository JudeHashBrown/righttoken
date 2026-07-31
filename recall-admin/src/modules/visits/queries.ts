import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { presentCountry } from "@/modules/visits/geography";
import { toShanghaiVisitDate } from "@/modules/visits/visit-date";

export type VisitRangeDays = 7 | 30 | 90;

type VisitCount = {
  uv: number;
  pv: number;
};

type DailyVisitCount = VisitCount & {
  date: Date;
};

type CountryVisitCount = VisitCount & {
  countryCode: string;
};

type RegionVisitCount = VisitCount & {
  region: string;
};

export type VisitQuerySource = {
  totals(start: Date, end: Date): Promise<VisitCount>;
  daily(start: Date, end: Date): Promise<DailyVisitCount[]>;
  countries(
    start: Date,
    end: Date
  ): Promise<CountryVisitCount[]>;
  chinaRegions(
    start: Date,
    end: Date
  ): Promise<RegionVisitCount[]>;
};

export type VisitDashboard = {
  rangeDays: VisitRangeDays;
  today: VisitCount;
  period: VisitCount;
  daily: Array<VisitCount & { date: string }>;
  countries: Array<
    CountryVisitCount & {
      name: string;
    }
  >;
  chinaRegions: RegionVisitCount[];
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const prismaVisitQuerySource: VisitQuerySource = {
  async totals(start, end) {
    const rows = await prisma.$queryRaw<VisitCount[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT "visitorHash")::int AS uv,
        COUNT(*)::int AS pv
      FROM "recall"."SiteVisit"
      WHERE "visitDate" >= ${start}
        AND "visitDate" < ${end}
    `);
    return rows[0] ?? { uv: 0, pv: 0 };
  },

  async daily(start, end) {
    return prisma.$queryRaw<DailyVisitCount[]>(Prisma.sql`
      SELECT
        "visitDate" AS date,
        COUNT(DISTINCT "visitorHash")::int AS uv,
        COUNT(*)::int AS pv
      FROM "recall"."SiteVisit"
      WHERE "visitDate" >= ${start}
        AND "visitDate" < ${end}
      GROUP BY "visitDate"
      ORDER BY "visitDate" ASC
    `);
  },

  async countries(start, end) {
    return prisma.$queryRaw<CountryVisitCount[]>(Prisma.sql`
      SELECT
        "countryCode" AS "countryCode",
        COUNT(DISTINCT "visitorHash")::int AS uv,
        COUNT(*)::int AS pv
      FROM "recall"."SiteVisit"
      WHERE "visitDate" >= ${start}
        AND "visitDate" < ${end}
      GROUP BY "countryCode"
      ORDER BY pv DESC, uv DESC, "countryCode" ASC
      LIMIT 100
    `);
  },

  async chinaRegions(start, end) {
    return prisma.$queryRaw<RegionVisitCount[]>(Prisma.sql`
      SELECT
        COALESCE(NULLIF("region", ''), '未知省份') AS region,
        COUNT(DISTINCT "visitorHash")::int AS uv,
        COUNT(*)::int AS pv
      FROM "recall"."SiteVisit"
      WHERE "visitDate" >= ${start}
        AND "visitDate" < ${end}
        AND "countryCode" = 'CN'
      GROUP BY COALESCE(NULLIF("region", ''), '未知省份')
      ORDER BY pv DESC, uv DESC, region ASC
      LIMIT 100
    `);
  }
};

function compareCounts<
  T extends VisitCount & { name?: string; region?: string }
>(left: T, right: T): number {
  return (
    right.pv - left.pv ||
    right.uv - left.uv ||
    (left.name ?? left.region ?? "").localeCompare(
      right.name ?? right.region ?? "",
      "zh-CN"
    )
  );
}

export async function getVisitDashboard(
  rangeDays: VisitRangeDays,
  now = new Date(),
  source: VisitQuerySource = prismaVisitQuerySource
): Promise<VisitDashboard> {
  const todayStart = toShanghaiVisitDate(now);
  const end = addDays(todayStart, 1);
  const start = addDays(end, -rangeDays);

  const [today, period, dailyRows, countryRows, regionRows] =
    await Promise.all([
      source.totals(todayStart, end),
      source.totals(start, end),
      source.daily(start, end),
      source.countries(start, end),
      source.chinaRegions(start, end)
    ]);

  const dailyByDate = new Map(
    dailyRows.map((row) => [dateKey(row.date), row])
  );
  const daily = Array.from({ length: rangeDays }, (_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    const row = dailyByDate.get(key);
    return {
      date: key,
      uv: row?.uv ?? 0,
      pv: row?.pv ?? 0
    };
  });
  const countries = countryRows
    .map((row) => ({
      ...row,
      name: presentCountry(row.countryCode)
    }))
    .sort(compareCounts);
  const chinaRegions = [...regionRows].sort(compareCounts);

  return {
    rangeDays,
    today,
    period,
    daily,
    countries,
    chinaRegions
  };
}
