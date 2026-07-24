import { z } from "zod";

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
    bodyText: z.string().trim().min(1).max(100_000)
  })
  .strict();
