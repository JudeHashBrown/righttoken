import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("obsolete RightToken user export path", () => {
  it("is not registered by the main-site admin router", () => {
    expect(source("../backend/internal/server/routes/admin.go")).not.toContain(
      'Group("/admin/recall")'
    );
  });

  it("is not exposed through main-site Compose files", () => {
    for (const file of [
      "../deploy/docker-compose.yml",
      "../deploy/docker-compose.standalone.yml",
      "../deploy/docker-compose.dev.yml",
      "../deploy/docker-compose.local.yml"
    ]) {
      expect(source(file)).not.toContain("RECALL_EXPORT_SECRET");
    }
  });
});
