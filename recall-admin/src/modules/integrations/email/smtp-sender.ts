import nodemailer from "nodemailer";
import type { SmtpImapConfig } from "@/modules/mail/adapters/smtp-imap";
import type { OutboundMailboxMessage } from "@/modules/mail/types";

type Transport = {
  sendMail(input: {
    from: { name: string; address: string };
    to: string[];
    subject: string;
    text: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
      cid?: string;
      contentDisposition: "inline" | "attachment";
    }>;
    inReplyTo?: string;
    references?: string[];
  }): Promise<{ messageId?: string }>;
};

type TransportFactory = (config: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}) => Transport;

export async function sendSmtpMessage(
  config: SmtpImapConfig,
  message: OutboundMailboxMessage,
  createTransport: TransportFactory = nodemailer.createTransport
): Promise<{ providerMessageId: string }> {
  const transport = createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.username,
      pass: config.password
    },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000
  });
  const result = await transport.sendMail({
    from: {
      name: config.displayName,
      address: config.emailAddress
    },
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.attachments?.length
      ? { attachments: message.attachments }
      : {}),
    ...(message.inReplyTo
      ? { inReplyTo: message.inReplyTo }
      : {}),
    ...(message.references?.length
      ? { references: message.references }
      : {})
  });
  if (!result.messageId) {
    throw new Error("SMTP_PROVIDER_MESSAGE_ID_MISSING");
  }
  return { providerMessageId: result.messageId };
}
