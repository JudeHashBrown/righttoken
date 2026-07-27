import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboardStyleSheets = [
  "src/components/workspaces/workspace.module.css",
  "src/components/dashboard/dashboard.module.css",
  "src/components/layout/app-header.module.css",
  "src/components/layout/app-sidebar.module.css",
  "src/components/automation/segment-rule-editor.module.css"
];

describe("admin typography scale", () => {
  it("keeps all dashboard business text at or above 12px", async () => {
    const undersized: string[] = [];

    for (const file of dashboardStyleSheets) {
      const css = await readFile(path.resolve(file), "utf8");
      for (const match of css.matchAll(/font-size:\s*(\d+)px/g)) {
        const size = Number(match[1]);
        if (size < 12) {
          undersized.push(`${file}: ${size}px`);
        }
      }
    }

    expect(undersized).toEqual([]);
  });

  it("reserves enough width for compact metric values", async () => {
    const css = await readFile(
      path.resolve(
        "src/components/workspaces/workspace.module.css"
      ),
      "utf8"
    );

    expect(css).toContain(
      "grid-template-columns: minmax(90px, auto) minmax(0, 1fr);"
    );
    expect(css).toContain(
      ".compactCardGrid .statCard strong {\n  white-space: nowrap;"
    );
    expect(css).toContain(
      ".compactCardGrid .statCard small {\n  grid-column: 1 / -1;\n  white-space: nowrap;"
    );
  });
});
