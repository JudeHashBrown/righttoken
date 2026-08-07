import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboardCssPath = path.resolve(
  "src/components/dashboard/dashboard.module.css"
);

describe("dashboard metric layout", () => {
  it("lets five or six compact metrics fill one wide-desktop row", async () => {
    const css = await readFile(dashboardCssPath, "utf8");

    expect(css).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));"
    );
    expect(css).toMatch(
      /\.metric \{[^}]*min-height: 112px;[^}]*gap: 8px;[^}]*padding: 14px;/
    );
    expect(css).toMatch(
      /\.metricIcon \{[^}]*width: 30px;[^}]*height: 30px;/
    );
    expect(css).toMatch(
      /\.metricCopy p \{[^}]*font-size: 12px;[^}]*white-space: nowrap;/
    );
    expect(css).toMatch(
      /\.metricCopy small \{[^}]*-webkit-line-clamp: 2;/
    );
  });

  it("steps down to three and two columns before mobile scrolling", async () => {
    const css = await readFile(dashboardCssPath, "utf8");

    expect(css).toMatch(
      /@media \(max-width: 1430px\)[\s\S]*?\.metrics \{[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.metrics \{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.metrics \{[\s\S]*?display: flex;/
    );
  });
});
