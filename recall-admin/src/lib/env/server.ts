import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JOB_DATABASE_URL: z.string().url(),
  SESSION_COOKIE_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "must decode to 32 bytes"
    ),
  APP_URL: z.string().url(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development")
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: Record<string, string | undefined>
): ServerEnv {
  return serverEnvSchema.parse(input);
}
