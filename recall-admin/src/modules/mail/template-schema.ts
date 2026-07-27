import { z } from "zod";

export const createMailTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    subject: z.string().trim().min(1).max(200),
    bodyText: z.string().trim().min(1).max(100_000),
    locale: z.string().trim().min(2).max(20).default("zh-CN")
  })
  .strict();
export const publishMailTemplateVersionSchema =
  createMailTemplateSchema.omit({ locale: true });

export const toggleMailTemplateSchema = z
  .object({
    enabled: z.boolean()
  })
  .strict();
