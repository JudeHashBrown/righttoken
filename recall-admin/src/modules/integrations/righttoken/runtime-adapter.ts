import { z } from "zod";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";
import type { RightTokenAdapter } from "@/modules/integrations/righttoken/adapter";
import { createRightTokenDatabaseAdapter } from "@/modules/integrations/righttoken/database-adapter";
import { createRightTokenSimulator } from "@/modules/integrations/righttoken/simulator";

const simulatorConfigSchema = z.object({
  mode: z.literal("simulator")
});

type RuntimeRightTokenEnv = {
  RIGHTTOKEN_SOURCE_MODE?: "database" | "simulator";
};

export function resolveRuntimeRightTokenConfig(
  stored: Record<string, unknown> | null,
  env: RuntimeRightTokenEnv
): Record<string, unknown> | null {
  if (env.RIGHTTOKEN_SOURCE_MODE === "database") {
    return { mode: "database" };
  }
  if (env.RIGHTTOKEN_SOURCE_MODE === "simulator") {
    return { mode: "simulator" };
  }
  if (simulatorConfigSchema.safeParse(stored).success) {
    return stored;
  }
  return null;
}

export async function getConfiguredRightTokenAdapter(): Promise<RightTokenAdapter | null> {
  const stored = await getIntegrationCredential("RIGHTTOKEN_SOURCE");
  const config = resolveRuntimeRightTokenConfig(stored, {
    RIGHTTOKEN_SOURCE_MODE:
      process.env.RIGHTTOKEN_SOURCE_MODE as RuntimeRightTokenEnv["RIGHTTOKEN_SOURCE_MODE"]
  });
  if (!config) {
    return null;
  }
  if (simulatorConfigSchema.safeParse(config).success) {
    return createRightTokenSimulator();
  }
  if (config.mode === "database") {
    return createRightTokenDatabaseAdapter();
  }
  return null;
}
