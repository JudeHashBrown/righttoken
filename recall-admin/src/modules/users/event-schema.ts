import { z } from "zod";

const commonShape = {
  event_id: z.string().trim().min(1).max(160),
  occurred_at: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  user_id: z.string().trim().min(1).max(160)
};

const optionalReason = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .strict();

const serviceAnomalyPayload = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
    error_message: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
  })
  .strict();

export const rightTokenEventSchema = z.discriminatedUnion(
  "event_type",
  [
    z
      .object({
        ...commonShape,
        event_type: z.literal("user.registered"),
        payload: z
          .object({
            email: z
              .string()
              .email()
              .transform((value) => value.trim().toLowerCase()),
            display_name: z.string().trim().min(1).max(120).optional(),
            registration_ip: z.string().trim().min(2).max(64).optional(),
            country_code: z
              .string()
              .trim()
              .length(2)
              .transform((value) => value.toUpperCase())
              .optional(),
            region: z.string().trim().min(1).max(120).optional(),
            language: z.string().trim().min(2).max(35).optional(),
            timezone: z.string().trim().min(1).max(80).optional(),
            source: z.string().trim().min(1).max(120).optional()
          })
          .strict()
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("checkout.started"),
        payload: z
          .object({
            checkout_id: z.string().trim().min(1).max(160).optional()
          })
          .strict()
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("checkout.cancelled"),
        payload: optionalReason
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("checkout.expired"),
        payload: optionalReason
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("payment.failed"),
        payload: optionalReason
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("payment.succeeded"),
        payload: z
          .object({
            payment_id: z.string().trim().min(1).max(160),
            amount_minor: z.number().int().nonnegative(),
            currency: z
              .string()
              .trim()
              .length(3)
              .transform((value) => value.toUpperCase())
              .optional(),
            amount_usd_minor: z.number().int().nonnegative().optional()
          })
          .strict()
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("balance.changed"),
        payload: z
          .object({
            balance_minor: z.number().int(),
            balance_currency: z
              .string()
              .trim()
              .length(3)
              .transform((value) => value.toUpperCase())
              .optional(),
            balance_usd_minor: z.number().int().optional()
          })
          .strict()
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("api_call.succeeded"),
        payload: z
          .object({
            call_id: z.string().trim().min(1).max(160).optional()
          })
          .strict()
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("service.anomaly"),
        payload: serviceAnomalyPayload
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("service.recovered"),
        payload: optionalReason
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("complaint.created"),
        payload: optionalReason
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("refund.requested"),
        payload: optionalReason
      })
      .strict(),
    z
      .object({
        ...commonShape,
        event_type: z.literal("user.profile_updated"),
        payload: z
          .object({
            email: z
              .string()
              .email()
              .transform((value) => value.trim().toLowerCase())
              .optional(),
            display_name: z.string().trim().min(1).max(120).optional(),
            country_code: z
              .string()
              .trim()
              .length(2)
              .transform((value) => value.toUpperCase())
              .optional(),
            region: z.string().trim().min(1).max(120).optional(),
            language: z.string().trim().min(2).max(35).optional(),
            timezone: z.string().trim().min(1).max(80).optional(),
            source: z.string().trim().min(1).max(120).optional()
          })
          .strict()
      })
      .strict()
  ]
);

export type RightTokenEventInput = z.infer<
  typeof rightTokenEventSchema
>;
