import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mail statistic layout", () => {
  it("fits ten compact capsules into two desktop rows", () => {
    const css = readFileSync(
      "src/components/workspaces/workspace.module.css",
      "utf8"
    );

    expect(css).toMatch(
      /\.mailStatGrid\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(css).toMatch(
      /\.mailStatGrid \.statCard\s*\{[^}]*padding:\s*12px/
    );
  });
});
