import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const grants = readFileSync(
  resolve(
    process.cwd(),
    "scripts/grant-shared-database-access.sql"
  ),
  "utf8"
);

describe("shared database grants", () => {
  it("allows main-data reads and recall-only writes", () => {
    expect(grants).toContain(
      "GRANT USAGE ON SCHEMA public TO righttoken_recall_app;"
    );
    expect(grants).toContain(
      "GRANT SELECT ON TABLE public.users, public.payment_orders, public.usage_logs, public.ops_error_logs TO righttoken_recall_app;"
    );
    expect(grants).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE"
    );
    expect(grants).toContain(
      "ALTER ROLE righttoken_recall_app WITH LOGIN NOINHERIT"
    );
    expect(grants).toContain(
      "GRANT USAGE, CREATE ON SCHEMA recall TO righttoken_recall_app;"
    );
    expect(grants).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA recall TO righttoken_recall_app;"
    );
    expect(grants).not.toContain("GRANT ALL ON SCHEMA public");
    expect(grants).not.toContain(
      "GRANT INSERT ON TABLE public.users"
    );
  });
});
