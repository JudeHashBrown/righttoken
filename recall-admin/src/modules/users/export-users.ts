import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import { mergeManagedUser } from "@/modules/users/managed-user";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";

const MAX_EXPORT_USERS = 100_000;

export type ExportUserRow = {
  externalUserId: string;
  email: string;
  displayName: string | null;
  currentSegment: string;
  countryCode: string | null;
  region: string | null;
  ownerName: string | null;
  registrationIp: string | null;
  registeredAt: Date;
  firstPaidAt: Date | null;
  totalPaidMinor: number;
  successfulCallCount: number;
  lastCallAt: Date | null;
  balanceMinor: number;
  balanceCurrency: string;
  anomalyActive: boolean;
  updatedAt: Date;
};

const headers = [
  "external_user_id",
  "email",
  "display_name",
  "segment",
  "country_code",
  "region",
  "owner",
  "registration_ip",
  "registered_at",
  "first_paid_at",
  "total_paid_minor",
  "successful_call_count",
  "last_call_at",
  "balance_minor",
  "balance_currency",
  "anomaly_active",
  "updated_at"
];

function blocksSpreadsheetFormula(value: string): boolean {
  return /^[=+\-@]/.test(value.trimStart());
}

export function escapeCsvCell(
  value: string | number | boolean | null
): string {
  let text = value === null ? "" : String(value);
  if (blocksSpreadsheetFormula(text)) {
    text = `'${text}`;
  }
  if (/[\r\n,"]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function iso(value: Date | null): string {
  return value?.toISOString() ?? "";
}

export function buildUsersCsv(rows: ExportUserRow[]): string {
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.externalUserId,
        row.email,
        row.displayName,
        row.currentSegment,
        row.countryCode,
        row.region,
        row.ownerName,
        row.registrationIp,
        iso(row.registeredAt),
        iso(row.firstPaidAt),
        row.totalPaidMinor,
        row.successfulCallCount,
        iso(row.lastCallAt),
        row.balanceMinor,
        row.balanceCurrency,
        row.anomalyActive,
        iso(row.updatedAt)
      ]
        .map(escapeCsvCell)
        .join(",")
    )
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function decryptIp(value: string | null): string | null {
  if (!value) return null;
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(Buffer.from(key, "base64")).decrypt(value);
}

export async function exportUsersCsv(
  actorId: string
): Promise<string> {
  const users = await prisma.userProfile.findMany({
    where: { sourceDeletedAt: null },
    orderBy: [{ registeredAt: "asc" }, { id: "asc" }],
    take: MAX_EXPORT_USERS + 1,
    select: {
      id: true,
      externalUserId: true,
      email: true,
      displayName: true,
      currentSegment: true,
      countryCode: true,
      region: true,
      registrationIpEnc: true,
      registeredAt: true,
      firstPaidAt: true,
      totalPaidMinor: true,
      successfulCallCount: true,
      lastCallAt: true,
      balanceMinor: true,
      balanceCurrency: true,
      anomalyActive: true,
      updatedAt: true,
      owner: {
        select: { displayName: true }
      }
    }
  });
  const liveFacts = await getProductionRightTokenUserFactsByIds(
    users.map((user) => user.externalUserId)
  );
  const databaseMode =
    process.env.RIGHTTOKEN_SOURCE_MODE === "database";
  const exportUsers = users.filter((user) => {
    const facts = liveFacts.get(user.externalUserId);
    return !databaseMode || Boolean(facts && !facts.deletedAt);
  });
  if (exportUsers.length > MAX_EXPORT_USERS) {
    throw new Error("USER_EXPORT_LIMIT_EXCEEDED");
  }
  const csv = buildUsersCsv(
    exportUsers.map((persistedUser) => {
      const facts = liveFacts.get(persistedUser.externalUserId);
      const user = facts
        ? mergeManagedUser(persistedUser, facts)
        : persistedUser;
      return {
        ...user,
        currentSegment: String(user.currentSegment),
        ownerName: user.owner?.displayName ?? null,
        registrationIp:
          facts?.registrationIp ??
          decryptIp(user.registrationIpEnc)
      };
    })
  );
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "users.export_csv",
      entityType: "UserProfile",
      metadata: {
        count: exportUsers.length,
        sensitiveFields: ["email", "registration_ip"]
      }
    }
  });
  return csv;
}
