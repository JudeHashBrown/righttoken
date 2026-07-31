import { getServerEnv } from "@/lib/env/runtime";
import { createSiteVisitHandler } from "@/modules/visits/internal-handler";
import { ingestRuntimeSiteVisit } from "@/modules/visits/runtime-ingest";

export const POST = createSiteVisitHandler({
  getSecrets() {
    const env = getServerEnv();
    return {
      current: env.INTERNAL_API_SECRET_CURRENT,
      previous: env.INTERNAL_API_SECRET_PREVIOUS
    };
  },
  ingestVisit: ingestRuntimeSiteVisit
});
