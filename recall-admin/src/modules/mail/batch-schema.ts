import { z } from "zod";
import {
  mailAssetReferenceSchema
} from "@/modules/mail/template-schema";

const contentShape = {
  mailboxId: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  purpose: z
    .enum([
      "PAYMENT_FOLLOW_UP",
      "KNOWLEDGE_SHARE",
      "PRODUCT_UPDATE",
      "CAMPAIGN",
      "OTHER"
    ])
    .default("OTHER"),
  bodyText: z.string().trim().min(1).max(100_000),
  bodyHtml: z.string().trim().max(200_000).default(""),
  assets: z
    .array(mailAssetReferenceSchema)
    .max(10)
    .optional()
    .default([])
};

export const mailBatchRequestSchema = z.discriminatedUnion(
  "mode",
  [
    z
      .object({
        ...contentShape,
        mode: z.literal("SEGMENT"),
        segment: z.enum(["F", "A", "B", "C", "D", "E", "G"])
      })
      .strict(),
    z
      .object({
        ...contentShape,
        mode: z.literal("ALL")
      })
      .strict()
  ]
);

export const mailAudienceQuerySchema = z.discriminatedUnion(
  "mode",
  [
    z
      .object({
        mode: z.literal("SEGMENT"),
        segment: z.enum(["F", "A", "B", "C", "D", "E", "G"])
      })
      .strict(),
    z.object({ mode: z.literal("ALL") }).strict()
  ]
);

export type MailBatchRequest = z.infer<
  typeof mailBatchRequestSchema
>;
