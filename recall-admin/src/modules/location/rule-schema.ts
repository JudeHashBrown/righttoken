import { z } from "zod";
import { normalizeLocationRulePattern } from "@/modules/location/email-domain";

export const locationRuleInputSchema = z
  .object({
    id: z.string().trim().min(1).max(160).optional(),
    name: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
    priority: z.number().int().min(1).max(10_000),
    matchType: z.enum(["EXACT_DOMAIN", "DOMAIN_SUFFIX"]),
    pattern: z.string().trim().min(2).max(253),
    countryCode: z
      .string()
      .trim()
      .regex(/^[a-z]{2}$/i)
      .transform((value) => value.toUpperCase())
  })
  .strict()
  .transform((value, context) => {
    const pattern = normalizeLocationRulePattern(
      value.pattern,
      value.matchType
    );
    if (!pattern) {
      context.addIssue({
        code: "custom",
        path: ["pattern"],
        message: "invalid or prohibited location rule pattern"
      });
      return z.NEVER;
    }
    return { ...value, pattern };
  });

export const locationRuleSetSchema = z
  .array(locationRuleInputSchema)
  .min(1)
  .max(500)
  .superRefine((rules, context) => {
    const priorities = new Set<number>();
    const patterns = new Set<string>();
    rules.forEach((rule, index) => {
      if (priorities.has(rule.priority)) {
        context.addIssue({
          code: "custom",
          path: [index, "priority"],
          message: "location rule priorities must be unique"
        });
      }
      priorities.add(rule.priority);

      const patternKey = `${rule.matchType}:${rule.pattern}`;
      if (patterns.has(patternKey)) {
        context.addIssue({
          code: "custom",
          path: [index, "pattern"],
          message: "location rule patterns must be unique"
        });
      }
      patterns.add(patternKey);
    });
  });

export type LocationRuleInput = z.infer<
  typeof locationRuleInputSchema
>;

