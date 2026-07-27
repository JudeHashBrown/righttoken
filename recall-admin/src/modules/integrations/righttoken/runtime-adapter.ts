import { z } from "zod";
import { getIntegrationCredential } from "@/modules/integrations/credential-store";
import type { RightTokenAdapter } from "@/modules/integrations/righttoken/adapter";
import { createRightTokenHttpAdapter } from "@/modules/integrations/righttoken/http-adapter";
import { createRightTokenSimulator } from "@/modules/integrations/righttoken/simulator";

const simulatorConfigSchema = z.object({
  mode: z.literal("simulator")
});

type RuntimeRightTokenEnv = {
  RIGHTTOKEN_API_BASE_URL?: string;
  RIGHTTOKEN_API_TOKEN?: string;
};

export function resolveRuntimeRightTokenConfig(
  stored: Record<string, unknown> | null,
  env: RuntimeRightTokenEnv
): Record<string, unknown> | null {
  if (stored) {
    return stored;
  }
  const baseUrl = env.RIGHTTOKEN_API_BASE_URL?.trim();
  const apiToken = env.RIGHTTOKEN_API_TOKEN?.trim();
  if (!baseUrl || !apiToken || apiToken.length < 32) {
    return null;
  }
  return {
    mode: "http",
    baseUrl,
    apiToken,
    usersPath: "/api/v1/admin/recall/users"
  };
}

export async function getConfiguredRightTokenAdapter(): Promise<RightTokenAdapter | null> {
  const stored = await getIntegrationCredential("RIGHTTOKEN_SOURCE");
  const config = resolveRuntimeRightTokenConfig(stored, {
    RIGHTTOKEN_API_BASE_URL:
      process.env.RIGHTTOKEN_API_BASE_URL,
    RIGHTTOKEN_API_TOKEN: process.env.RIGHTTOKEN_API_TOKEN
  });
  if (!config) {
    return null;
  }
  if (simulatorConfigSchema.safeParse(config).success) {
    return createRightTokenSimulator();
  }
  return createRightTokenHttpAdapter(config);
}
