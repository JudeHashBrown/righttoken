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
    "prisma/migrations/20260727090000_move_recall_tables_to_schema/migration.sql"
  ),
  "utf8"
);
const prismaClient = readFileSync(
  resolve(projectRoot, "src/lib/db/prisma.ts"),
  "utf8"
);
const seed = readFileSync(
  resolve(projectRoot, "prisma/seed.ts"),
  "utf8"
);

describe("shared database schema boundary", () => {
  it("places every Prisma model and enum in the recall schema", () => {
    const declarations = schema.match(/^(?:model|enum) \w+ \{/gm) ?? [];
    const schemaAnnotations =
      schema.match(/@@schema\("recall"\)/g) ?? [];

    expect(schema).toContain('schemas  = ["recall"]');
    expect(schemaAnnotations).toHaveLength(declarations.length);
    expect(schema).not.toContain('@@schema("public")');
  });

  it("moves only explicitly named recall objects", () => {
    expect(migration).toContain(
      'CREATE SCHEMA IF NOT EXISTS "recall";'
    );
    expect(migration).toContain(
      'ALTER TABLE IF EXISTS "public"."Member" SET SCHEMA "recall";'
    );
    expect(migration).toContain(
      'ALTER TYPE "public"."MemberRole" SET SCHEMA "recall";'
    );
    expect(migration).not.toMatch(
      /DROP\s+(?:TABLE|SCHEMA)\s+(?:"public"\.)?/i
    );
    expect(migration).not.toContain("EXECUTE format");
  });

  it("configures runtime and seed queries for the recall schema", () => {
    expect(prismaClient).toContain('{ schema: "recall" }');
    expect(seed).toContain('{ schema: "recall" }');
  });
});
