import {
  mkdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const RIR_SOURCES = [
  {
    registry: "afrinic",
    url: "https://ftp.afrinic.net/stats/afrinic/delegated-afrinic-extended-latest"
  },
  {
    registry: "apnic",
    url: "https://ftp.apnic.net/stats/apnic/delegated-apnic-extended-latest"
  },
  {
    registry: "arin",
    url: "https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest"
  },
  {
    registry: "lacnic",
    url: "https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest"
  },
  {
    registry: "ripencc",
    url: "https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest"
  }
];

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

function hasDelegatedRanges(
  registry: string,
  content: string
): boolean {
  return content.split(/\r?\n/).some((line) => {
    const fields = line.split("|");
    return (
      fields[0]?.toLowerCase() === registry &&
      /^[A-Z]{2}$/i.test(fields[1] ?? "") &&
      (fields[2] === "ipv4" || fields[2] === "ipv6") &&
      Boolean(fields[3]) &&
      Boolean(fields[4]) &&
      ["allocated", "assigned"].includes(
        fields[6]?.toLowerCase() ?? ""
      )
    );
  });
}

function normalizeSnapshot(registry: string, content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!hasDelegatedRanges(registry, normalized)) {
    throw new Error(
      `${registry} snapshot did not contain delegated IP ranges`
    );
  }
  return `# source: ${registry}\n${normalized}\n`;
}

export async function updateRirSnapshot({
  outputPath,
  fetchImpl = fetch
}: {
  outputPath: string;
  fetchImpl?: FetchLike;
}): Promise<{ outputPath: string; sources: number; bytes: number }> {
  const snapshots = await Promise.all(
    RIR_SOURCES.map(async (source) => {
      const response = await fetchImpl(source.url, {
        headers: {
          accept: "text/plain",
          "user-agent": "RightToken-Recall-GeoIP/1.0"
        },
        redirect: "follow"
      });
      if (!response.ok) {
        throw new Error(
          `${source.registry} snapshot returned HTTP ${response.status}`
        );
      }
      return normalizeSnapshot(source.registry, await response.text());
    })
  );
  const content = [
    "# RightToken combined RIR delegated statistics",
    `# generated-at: ${new Date().toISOString()}`,
    ...snapshots
  ].join("\n");
  const directory = dirname(outputPath);
  const temporaryPath = join(
    directory,
    `.${basename(outputPath)}.${process.pid}.tmp`
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode: 0o644
    });
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return {
    outputPath,
    sources: snapshots.length,
    bytes: Buffer.byteLength(content)
  };
}
