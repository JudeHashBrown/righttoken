import { z } from "zod";
import {
  rightTokenUserSnapshotSchema,
  type RightTokenAdapter
} from "@/modules/integrations/righttoken/adapter";

export const rightTokenHttpConfigSchema = z.object({
  mode: z.literal("http"),
  baseUrl: z.string().url(),
  apiToken: z.string().min(32),
  usersPath: z
    .string()
    .startsWith("/")
    .default("/api/v1/admin/recall/users")
});

type Fetch = typeof fetch;

function endpoint(
  config: z.infer<typeof rightTokenHttpConfigSchema>,
  input?: { updatedAfter?: Date; cursor?: string; limit?: number }
) {
  const url = new URL(config.usersPath, config.baseUrl);
  if (input?.updatedAfter) {
    url.searchParams.set(
      "updated_after",
      input.updatedAfter.toISOString()
    );
  }
  if (input?.cursor) {
    url.searchParams.set("cursor", input.cursor);
  }
  if (input?.limit) {
    url.searchParams.set("limit", String(input.limit));
  }
  return url;
}

export function createRightTokenHttpAdapter(
  rawConfig: unknown,
  fetchImpl: Fetch = fetch
): RightTokenAdapter {
  const config = rightTokenHttpConfigSchema.parse(rawConfig);

  async function request(url: URL) {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiToken}`
      },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      throw new Error(`RIGHTTOKEN_HTTP_${response.status}`);
    }
    return response;
  }

  return {
    async verifyConnection() {
      await request(endpoint(config, { limit: 1 }));
      return { ok: true, source: "righttoken-http" };
    },
    async listUsers(input) {
      const response = await request(endpoint(config, input));
      const body = (await response.json()) as unknown;
      const parsed = z
        .object({
          users: z.array(rightTokenUserSnapshotSchema),
          nextCursor: z.string().nullable().optional()
        })
        .parse(body);
      return {
        users: parsed.users,
        nextCursor: parsed.nextCursor ?? null
      };
    }
  };
}
