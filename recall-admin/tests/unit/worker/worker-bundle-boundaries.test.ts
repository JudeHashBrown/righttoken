import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("worker bundle boundaries", () => {
  it("does not import Next.js request-only modules", async () => {
    const result = await build({
      entryPoints: ["src/worker/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      packages: "external",
      write: false
    });
    const output = result.outputFiles
      .map((file) => file.text)
      .join("\n");

    expect(output).not.toContain('from "next/headers"');
    expect(output).not.toContain('from "next/server"');
  });
});
