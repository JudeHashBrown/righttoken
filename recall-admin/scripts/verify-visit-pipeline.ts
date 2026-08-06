import { pathToFileURL } from "node:url";
import { prisma } from "@/lib/db/prisma";
import {
  getGeoIpRuntimeStatus,
  type GeoIpRuntimeStatus
} from "@/modules/geoip/runtime-status-core";

export type VisitPipelineDependencies = {
  siteVisitTableExists: () => Promise<boolean>;
  geoIpStatus: () => Promise<GeoIpRuntimeStatus>;
};

type ReadyGeoIpKind = Exclude<GeoIpRuntimeStatus["kind"], "unavailable">;

export type VisitPipelineCliDependencies = VisitPipelineDependencies & {
  disconnect: () => Promise<void>;
};

type VisitPipelineDatabase = {
  $queryRaw(
    query: TemplateStringsArray
  ): Promise<Array<{ relation: string | null }>>;
  $disconnect(): Promise<void>;
};

type VisitPipelineCliOutput = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

const validationCodes = new Set([
  "VISIT_PIPELINE_TABLE_MISSING",
  "VISIT_PIPELINE_GEOIP_UNAVAILABLE"
]);

function stableFailureCode(error: unknown): string {
  if (error instanceof Error && validationCodes.has(error.message)) {
    return error.message;
  }
  return "VISIT_PIPELINE_CHECK_FAILED";
}

export async function verifyVisitPipeline(
  dependencies: VisitPipelineDependencies
): Promise<void> {
  if (!(await dependencies.siteVisitTableExists())) {
    throw new Error("VISIT_PIPELINE_TABLE_MISSING");
  }

  const status = await dependencies.geoIpStatus();
  if (status.kind === "unavailable") {
    throw new Error("VISIT_PIPELINE_GEOIP_UNAVAILABLE");
  }
}

export function createVisitPipelineRuntimeDependencies(
  database: VisitPipelineDatabase = prisma,
  geoIpStatus: () => Promise<GeoIpRuntimeStatus> = getGeoIpRuntimeStatus
): VisitPipelineCliDependencies {
  return {
    siteVisitTableExists: async () => {
      const [result] = await database
        .$queryRaw`SELECT to_regclass('recall."SiteVisit"')::text AS relation`;
      return Boolean(result?.relation);
    },
    geoIpStatus,
    disconnect: () => database.$disconnect()
  };
}

export async function runVisitPipelineCli(
  dependencies: VisitPipelineCliDependencies,
  output: VisitPipelineCliOutput = {
    stdout: (message) => process.stdout.write(message),
    stderr: (message) => process.stderr.write(message)
  }
): Promise<0 | 1> {
  let failure: unknown;
  let readyKind: ReadyGeoIpKind | undefined;

  try {
    await verifyVisitPipeline({
      siteVisitTableExists: dependencies.siteVisitTableExists,
      geoIpStatus: async () => {
        const status = await dependencies.geoIpStatus();
        if (status.kind !== "unavailable") {
          readyKind = status.kind;
        }
        return status;
      }
    });
  } catch (error) {
    failure = error;
  } finally {
    try {
      await dependencies.disconnect();
    } catch (error) {
      failure ??= error;
    }
  }

  if (failure || !readyKind) {
    output.stderr(`${stableFailureCode(failure)}\n`);
    return 1;
  }

  output.stdout(`visit_pipeline_ready:${readyKind}\n`);
  return 0;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (entrypoint === import.meta.url) {
  void runVisitPipelineCli(
    createVisitPipelineRuntimeDependencies()
  ).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
