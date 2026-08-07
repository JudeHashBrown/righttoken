import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, "../../..");
const schema = readFileSync(
  resolve(projectRoot, "prisma/schema.prisma"),
  "utf8"
);
const migration = readFileSync(
  resolve(
    projectRoot,
    "prisma/migrations/20260806120000_add_dashboard_recent_user_indexes/migration.sql"
  ),
  "utf8"
);

describe("dashboard recent-user indexes", () => {
  it("indexes both rolling 72-hour dashboard predicates", () => {
    expect(schema).toContain(
      '@@index([currentSegment, sourceDeletedAt, registeredAt], map: "UserProfile_recent_unpaid_idx")'
    );
    expect(schema).toContain(
      '@@index([currentSegment, anomalyActive, sourceDeletedAt, anomalyLastOccurredAt], map: "UserProfile_recent_anomaly_occurred_idx")'
    );
    expect(schema).toContain(
      '@@index([currentSegment, anomalyActive, sourceDeletedAt, anomalyChangedAt], map: "UserProfile_recent_anomaly_changed_idx")'
    );
    expect(migration).toContain(
      'CREATE INDEX "UserProfile_recent_unpaid_idx"'
    );
    expect(migration).toContain(
      'CREATE INDEX "UserProfile_recent_anomaly_occurred_idx"'
    );
    expect(migration).toContain(
      'CREATE INDEX "UserProfile_recent_anomaly_changed_idx"'
    );
  });
});
