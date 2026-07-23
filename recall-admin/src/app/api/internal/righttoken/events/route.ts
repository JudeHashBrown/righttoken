import { getServerEnv } from "@/lib/env/runtime";
import { createRightTokenEventHandler } from "@/modules/integrations/righttoken-event-handler";
import { getRuntimeTaskScheduler } from "@/modules/tasks/runtime-scheduler";
import { ingestUserEvent } from "@/modules/users/apply-event";

export const POST = createRightTokenEventHandler({
  getSecrets() {
    const env = getServerEnv();
    return {
      current: env.INTERNAL_API_SECRET_CURRENT,
      previous: env.INTERNAL_API_SECRET_PREVIOUS
    };
  },
  getScheduler: getRuntimeTaskScheduler,
  ingestEvent: ingestUserEvent
});
