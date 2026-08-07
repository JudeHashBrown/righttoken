import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("mail delivery event migration", () => {
  afterAll(async () => prisma.$disconnect());

  it("creates durable delivery event storage", async () => {
    const columns = await prisma.$queryRaw<
      Array<{ column_name: string }>
    >`
      SELECT "column_name"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'recall'
        AND "table_name" = 'MailDeliveryEvent'
      ORDER BY "column_name" ASC
    `;

    expect(columns.map((row) => row.column_name)).toEqual([
      "action",
      "createdAt",
      "diagnosticCode",
      "id",
      "inboundProviderMessageId",
      "mailboxId",
      "outboundMessageId",
      "recipientNormalized",
      "reportedAt",
      "statusCode"
    ]);
  });

  it("adds bounce and retry metadata without removing history", async () => {
    const columns = await prisma.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT "table_name", "column_name"
      FROM "information_schema"."columns"
      WHERE "table_schema" = 'recall'
        AND (
          ("table_name" = 'MailMessage' AND "column_name" IN (
            'bouncedAt', 'bounceStatusCode', 'bounceDiagnostic'
          ))
          OR ("table_name" = 'MailBatch' AND "column_name" = 'retryRootBatchId')
          OR ("table_name" = 'MailBatchRecipient' AND "column_name" IN (
            'retryOfRecipientId', 'bouncedAt', 'bounceStatusCode', 'bounceDiagnostic'
          ))
        )
      ORDER BY "table_name" ASC, "column_name" ASC
    `;

    expect(columns).toHaveLength(8);
  });

  it("adds explicit bounced states and delivery actions", async () => {
    const values = await prisma.$queryRaw<
      Array<{ type_name: string; enum_value: string }>
    >`
      SELECT "pg_type"."typname" AS "type_name",
             "pg_enum"."enumlabel" AS "enum_value"
      FROM "pg_enum"
      JOIN "pg_type" ON "pg_type"."oid" = "pg_enum"."enumtypid"
      JOIN "pg_namespace" ON "pg_namespace"."oid" = "pg_type"."typnamespace"
      WHERE "pg_namespace"."nspname" = 'recall'
        AND (
          ("pg_type"."typname" IN ('MailMessageStatus', 'MailBatchRecipientStatus')
            AND "pg_enum"."enumlabel" = 'BOUNCED')
          OR "pg_type"."typname" = 'MailDeliveryAction'
        )
      ORDER BY "type_name" ASC, "pg_enum"."enumsortorder" ASC
    `;

    expect(values).toEqual([
      { type_name: "MailBatchRecipientStatus", enum_value: "BOUNCED" },
      { type_name: "MailDeliveryAction", enum_value: "FAILED" },
      { type_name: "MailDeliveryAction", enum_value: "DELAYED" },
      { type_name: "MailDeliveryAction", enum_value: "DELIVERED" },
      { type_name: "MailDeliveryAction", enum_value: "OTHER" },
      { type_name: "MailMessageStatus", enum_value: "BOUNCED" }
    ]);
  });
});
