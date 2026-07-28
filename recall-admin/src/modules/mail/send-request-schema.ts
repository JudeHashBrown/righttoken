import { z } from "zod";
import {
  mailAssetReferenceSchema
} from "@/modules/mail/template-schema";

export const mailSendRequestSchema = z
  .object({
    mailboxId: z.string().min(1),
    taskId: z.string().min(1),
    recipient: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(320),
    subject: z.string().trim().min(1).max(200),
    bodyText: z.string().trim().min(1).max(100_000),
    bodyHtml: z.string().trim().max(200_000).optional().default(""),
    assets: z
      .array(mailAssetReferenceSchema)
      .max(10)
      .optional()
      .default([])
  })
  .strict();
