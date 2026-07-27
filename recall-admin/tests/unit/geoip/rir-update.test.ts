import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  RIR_SOURCES,
  updateRirSnapshot
} from "@/modules/geoip/rir-update";

function delegated(registry: string, countryCode: string): string {
  return [
    "2|registry|serial|records|startdate|enddate|UTC|+0000",
    `${registry}|${countryCode}|ipv4|1.0.0.0|256|20260725|allocated`
  ].join("\n");
}

describe("RIR snapshot updater", () => {
  it("uses all five official regional registries", () => {
    expect(RIR_SOURCES.map((source) => source.registry)).toEqual([
      "afrinic",
      "apnic",
      "arin",
      "lacnic",
      "ripencc"
    ]);
    expect(
      RIR_SOURCES.every((source) => source.url.startsWith("https://"))
    ).toBe(true);
    expect(
      Object.fromEntries(
        RIR_SOURCES.map((source) => [source.registry, source.url])
      )
    ).toEqual({
      afrinic:
        "https://ftp.afrinic.net/stats/afrinic/delegated-afrinic-extended-latest",
      apnic:
        "https://ftp.apnic.net/stats/apnic/delegated-apnic-extended-latest",
      arin:
        "https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest",
      lacnic:
        "https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest",
      ripencc:
        "https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest"
    });
  });

  it("downloads, validates, and atomically combines snapshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "righttoken-rir-"));
    const outputPath = join(directory, "delegated-rir-latest.txt");
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const source = RIR_SOURCES.find((item) => item.url === String(url));
      if (!source) return new Response("not found", { status: 404 });
      return new Response(delegated(source.registry, "CN"));
    });

    const result = await updateRirSnapshot({
      outputPath,
      fetchImpl
    });

    expect(result.sources).toBe(5);
    expect(result.bytes).toBeGreaterThan(100);
    const content = await readFile(outputPath, "utf8");
    for (const source of RIR_SOURCES) {
      expect(content).toContain(`${source.registry}|CN|ipv4|`);
    }
  });

  it("keeps the previous snapshot when any download is invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "righttoken-rir-"));
    const outputPath = join(directory, "delegated-rir-latest.txt");
    await writeFile(outputPath, "previous-good-snapshot", "utf8");
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const source = RIR_SOURCES.find((item) => item.url === String(url))!;
      return new Response(
        source.registry === "arin"
          ? "<html>temporary error</html>"
          : delegated(source.registry, "US")
      );
    });

    await expect(
      updateRirSnapshot({ outputPath, fetchImpl })
    ).rejects.toThrow(/arin/i);
    await expect(readFile(outputPath, "utf8")).resolves.toBe(
      "previous-good-snapshot"
    );
  });
});
