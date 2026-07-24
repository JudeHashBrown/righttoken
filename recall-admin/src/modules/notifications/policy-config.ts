import { z } from "zod";

const levelPolicySchema = z
  .object({
    wecom: z.boolean(),
    email: z.boolean(),
    repeatMinutes: z.number().int().min(0).max(10_080),
    escalateMinutes: z.number().int().min(0).max(43_200)
  })
  .strict();

export const notificationPolicySchema = z
  .object({
    urgent: levelPolicySchema,
    important: levelPolicySchema,
    normal: levelPolicySchema,
    dailyDigestTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  })
  .strict();

export type NotificationPolicy = z.infer<
  typeof notificationPolicySchema
>;

export const defaultNotificationPolicy: NotificationPolicy = {
  urgent: {
    wecom: true,
    email: true,
    repeatMinutes: 15,
    escalateMinutes: 30
  },
  important: {
    wecom: true,
    email: false,
    repeatMinutes: 0,
    escalateMinutes: 120
  },
  normal: {
    wecom: false,
    email: false,
    repeatMinutes: 0,
    escalateMinutes: 1440
  },
  dailyDigestTime: "10:00"
};
