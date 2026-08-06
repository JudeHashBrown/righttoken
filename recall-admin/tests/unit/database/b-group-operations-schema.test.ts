import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const schema = readFileSync(
  resolve(projectRoot, "prisma/schema.prisma"),
  "utf8"
);
const migrationPath = resolve(
  projectRoot,
  "prisma/migrations/20260806150000_add_b_group_operations/migration.sql"
);

describe("B group operations persistence", () => {
  it("defines user-owned contacts, maintenance records, and coupon grants", () => {
    expect(schema).toContain("enum MailPurpose");
    expect(schema).toContain("model UserContact");
    expect(schema).toContain("model UserMaintenanceRecord");
    expect(schema).toContain("model CouponGrant");
    expect(schema).toContain("userId           String   @unique");
    expect(schema).toContain("sourceMessageId String?           @unique");
  });

  it("stores mail purpose on direct and batch mail", () => {
    const purposeFields = schema.match(
      /purpose\s+MailPurpose\s+@default\(OTHER\)/g
    );
    expect(purposeFields).toHaveLength(2);
  });

  it("ships a migration with database uniqueness safeguards", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "UserContact_userId_key"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "CouponGrant_userId_key"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "UserMaintenanceRecord_sourceMessageId_key"'
    );
  });
});
