import { z } from "zod";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";
import type { RightTokenAdapter } from "@/modules/integrations/righttoken/adapter";
import { createRightTokenHttpAdapter } from "@/modules/integrations/righttoken/http-adapter";
import { createRightTokenSimulator } from "@/modules/integrations/righttoken/simulator";

const simulatorConfigSchema = z.object({
  mode: z.literal("simulator")
});

export async function getConfiguredRightTokenAdapter(): Promise<RightTokenAdapter | null> {
  const config = await getIntegrationCredential("RIGHTTOKEN_SOURCE");
  if (!config) {
    return null;
  }
  if (simulatorConfigSchema.safeParse(config).success) {
    return createRightTokenSimulator();
  }
  return createRightTokenHttpAdapter(config);
}
