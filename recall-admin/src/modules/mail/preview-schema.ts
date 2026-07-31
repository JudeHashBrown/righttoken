import { z } from "zod";
import {
  mailAssetReferenceSchema
} from "@/modules/mail/template-schema";

export const mailPreviewRequestSchema = z
  .object({
    subject: z.string().max(200).default(""),
    bodyHtml: z.string().max(200_000),
    assets: z
      .array(mailAssetReferenceSchema)
      .max(10)
      .optional()
      .default([])
  })
  .strict();
