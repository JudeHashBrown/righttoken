import { getServerEnv } from "@/lib/env/runtime";
import { createRightTokenEventHandler } from "@/modules/integrations/righttoken-event-handler";
import { getRuntimeTaskScheduler } from "@/modules/tasks/runtime-scheduler";
import { ingestUserEvent } from "@/modules/users/apply-event";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";

export const POST = createRightTokenEventHandler({
  async getSecrets() {
    const credential = await getIntegrationCredential(
      "RIGHTTOKEN_SOURCE"
    );
    const env = getServerEnv();
    return {
      current:
        typeof credential?.eventSecret === "string"
          ? credential.eventSecret
          : env.INTERNAL_API_SECRET_CURRENT,
      previous:
        typeof credential?.previousEventSecret === "string"
          ? credential.previousEventSecret
          : env.INTERNAL_API_SECRET_PREVIOUS
    };
  },
  getScheduler: getRuntimeTaskScheduler,
  ingestEvent: ingestUserEvent
});
