import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional()
);
const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.string().url().optional()
);
const optionalPort = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().min(1).max(65_535).optional()
);
const optionalEnvBoolean = z.preprocess(
  (value) => {
    if (value === "" || value === undefined) {
      return undefined;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return value;
  },
  z.boolean().optional()
);
const requiredEnvBoolean = z.preprocess(
  (value) => {
    if (value === undefined) {
      return false;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return value;
  },
  z.boolean()
);

const serverEnvSchema = z
  .object({
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
    AUTH_MODE: z
      .enum(["standalone", "righttoken"])
      .default("standalone"),
    INTERNAL_API_SECRET_CURRENT: z.string().min(32),
    INTERNAL_API_SECRET_PREVIOUS: z.preprocess(
      emptyStringToUndefined,
      z.string().min(32).optional()
    ),
    RIGHTTOKEN_ISSUER: optionalUrl,
    RIGHTTOKEN_AUDIENCE: optionalString,
    RIGHTTOKEN_JWKS_URL: optionalUrl,
    RIGHTTOKEN_ROLE_MAP: optionalString,
    RIGHTTOKEN_API_BASE_URL: optionalUrl,
    RIGHTTOKEN_API_TOKEN: z.preprocess(
      emptyStringToUndefined,
      z.string().min(32).optional()
    ),
    RECONCILE_ENABLED: requiredEnvBoolean,
    RECONCILE_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(15),
    FULL_RECONCILE_CRON: z.string().min(1).default("0 2 * * *"),
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalPort,
    SMTP_SECURE: optionalEnvBoolean,
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    IMAP_HOST: optionalString,
    IMAP_PORT: optionalPort,
    IMAP_SECURE: optionalEnvBoolean,
    IMAP_USER: optionalString,
    IMAP_PASSWORD: optionalString,
    WECHAT_WEBHOOK_URL: optionalUrl,
    NOTIFICATION_FROM: z.preprocess(
      emptyStringToUndefined,
      z.string().email().optional()
    ),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development")
  })
  .superRefine((value, context) => {
    if (value.AUTH_MODE !== "righttoken") {
      return;
    }

    for (const field of [
      "RIGHTTOKEN_ISSUER",
      "RIGHTTOKEN_AUDIENCE",
      "RIGHTTOKEN_JWKS_URL"
    ] as const) {
      if (!value[field]) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when AUTH_MODE=righttoken`
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: Record<string, string | undefined>
): ServerEnv {
  return serverEnvSchema.parse(input);
}
