import { resolve } from "node:path";
import { updateRirSnapshot } from "../src/modules/geoip/rir-update";

function outputArgument(): string | null {
  const index = process.argv.indexOf("--output");
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const outputPath = resolve(
  outputArgument() ??
    process.env.GEOIP_RIR_PATH ??
    "data/geoip/delegated-rir.txt"
);

async function main(): Promise<void> {
  try {
    const result = await updateRirSnapshot({ outputPath });
    console.log(
      `Updated ${result.sources} RIR sources at ${result.outputPath} (${result.bytes} bytes)`
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "RIR update failed"
    );
    process.exitCode = 1;
  }
}

void main();
