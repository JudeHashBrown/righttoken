import { z } from "zod";
import {
  mailAssetReferenceSchema
} from "@/modules/mail/template-schema";

export const mailSendRequestSchema = z
  .object({
    mailboxId: z.string().min(1),
    userId: z.string().min(1),
    taskId: z.string().min(1).optional(),
    recipient: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(320),
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
    bodyHtml: z.string().trim().max(200_000).optional().default(""),
    assets: z
      .array(mailAssetReferenceSchema)
      .max(10)
      .optional()
      .default([])
  })
  .strict();
