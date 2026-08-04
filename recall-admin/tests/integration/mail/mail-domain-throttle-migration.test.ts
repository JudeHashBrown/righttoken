import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("mail domain throttle migration", () => {
  afterAll(async () => prisma.$disconnect());

  it("creates the durable sender-domain throttle columns", async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT "column_name"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'recall'
        AND "table_name" = 'MailDomainThrottle'
      ORDER BY "column_name" ASC
    `;
    expect(columns.map((row) => row.column_name)).toEqual([
      "createdAt",
      "nextAvailableAt",
      "senderDomain",
      "updatedAt"
    ]);
  });
});
