import { z } from "zod";
import { ImapFlow } from "imapflow";
import {
  simpleParser,
  type AddressObject
} from "mailparser";
import {
  sendSmtpMessage,
  verifySmtpConnection
} from "@/modules/integrations/email/smtp-sender";
import type {
  MailboxAdapter,
  MailboxMessage
} from "@/modules/mail/types";

const serverSchema = z
  .object({
    host: z.string().trim().min(1).max(255),
    port: z.number().int().min(1).max(65_535),
    secure: z.boolean()
  })
  .strict();

export const smtpImapConfigSchema = z
  .object({
    emailAddress: z
      .string()
      .email()
      .transform((value) => value.trim().toLowerCase()),
    displayName: z.string().trim().min(1).max(120),
    username: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(1_000),
    smtp: serverSchema,
    imap: serverSchema
  })
  .strict();

export type SmtpImapConfig = z.infer<typeof smtpImapConfigSchema>;

export function namecheapMailboxConfig(
  input: Pick<
    SmtpImapConfig,
    "emailAddress" | "displayName" | "username" | "password"
  >
): SmtpImapConfig {
  return smtpImapConfigSchema.parse({
    ...input,
    smtp: {
      host: "mail.privateemail.com",
      port: 465,
      secure: true
    },
    imap: {
      host: "mail.privateemail.com",
      port: 993,
      secure: true
    }
  });
}

function addresses(
  value: AddressObject | AddressObject[] | undefined
): string[] {
  const objects = value
    ? Array.isArray(value)
      ? value
      : [value]
    : [];
  return objects.flatMap((item) =>
    item.value
      .map((entry) => entry.address?.trim().toLowerCase())
      .filter((entry): entry is string => Boolean(entry))
  );
}

type ParsedMailLike = {
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  from?: AddressObject | AddressObject[];
  to?: AddressObject | AddressObject[];
  subject?: string;
  text?: string;
  html?: string | false;
  date?: Date;
  attachments?: Array<{
    filename?: string;
    contentType: string;
    content: Buffer;
    cid?: string;
    contentDisposition?: string;
  }>;
};

export function parsedMailToMailboxMessage(
  parsed: ParsedMailLike,
  internalDate: Date
): MailboxMessage | null {
  const fromAddress = addresses(parsed.from)[0];
  const providerMessageId = parsed.messageId?.trim();
  if (!fromAddress || !providerMessageId) {
    return null;
  }
  return {
    providerMessageId,
    inReplyTo: parsed.inReplyTo?.trim() ?? null,
    references: Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [],
    fromAddress,
    toAddresses: addresses(parsed.to),
    subject: parsed.subject?.trim() || "(无主题)",
    bodyText: parsed.text?.trim() || "",
    bodyHtml:
      typeof parsed.html === "string"
        ? parsed.html.trim() || null
        : null,
    attachments: (parsed.attachments ?? []).map(
      (attachment, index) => ({
        fileName:
          attachment.filename?.trim() ||
          `image-${index + 1}`,
        contentType: attachment.contentType,
        content: attachment.content,
        cid: attachment.cid?.trim() || null,
        disposition:
          attachment.contentDisposition === "inline" ||
          Boolean(attachment.cid)
            ? ("INLINE" as const)
            : ("ATTACHMENT" as const)
      })
    ),
    receivedAt: parsed.date ?? internalDate
  };
}

type FetchedMessageSource = {
  source?: Buffer | null;
  internalDate?: Date | string | null;
};

type ParseFetchedMessage = (
  source: Buffer,
  internalDate: Date
) => Promise<MailboxMessage | null>;

type ParseFailureReporter = (detail: {
  stage: "message_parse";
  code: "IMAP_MESSAGE_PARSE_FAILED";
}) => void;

export async function parseFetchedMessage(
  source: Buffer,
  internalDate: Date
): Promise<MailboxMessage | null> {
  const parsed = await simpleParser(source, {
    skipHtmlToText: true,
    skipTextToHtml: true
  });
  return parsedMailToMailboxMessage(parsed, internalDate);
}

function reportParseFailure(detail: {
  stage: "message_parse";
  code: "IMAP_MESSAGE_PARSE_FAILED";
}): void {
  console.error("mail_message_parse_failed", detail);
}

export async function collectFetchedMessages(
  items:
    | AsyncIterable<FetchedMessageSource>
    | Iterable<FetchedMessageSource>,
  parseMessage: ParseFetchedMessage = parseFetchedMessage,
  onParseFailure: ParseFailureReporter = reportParseFailure
): Promise<MailboxMessage[]> {
  const messages: MailboxMessage[] = [];
  for await (const item of items) {
    if (!item.source) {
      continue;
    }
    try {
      const message = await parseMessage(
        item.source,
        item.internalDate instanceof Date
          ? item.internalDate
          : new Date(item.internalDate ?? Date.now())
      );
      if (message) {
        messages.push(message);
      }
    } catch {
      onParseFailure({
        stage: "message_parse",
        code: "IMAP_MESSAGE_PARSE_FAILED"
      });
    }
  }
  return messages;
}

export function createSmtpImapAdapter(
  rawConfig: SmtpImapConfig
): MailboxAdapter {
  const config = smtpImapConfigSchema.parse(rawConfig);

  function imapClient(): ImapFlow {
    return new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: {
        user: config.username,
        pass: config.password
      },
      logger: false,
      socketTimeout: 10_000
    });
  }

  return {
    async testConnection() {
      const client = imapClient();
      await Promise.all([
        (async () => {
          await client.connect();
          await client.logout();
        })(),
        verifySmtpConnection(config)
      ]);
      return { ok: true };
    },

    send(message) {
      return sendSmtpMessage(config, message);
    },

    async listMessagesSince(since): Promise<MailboxMessage[]> {
      const client = imapClient();
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const ids = await client.search(
          { since },
          { uid: true }
        );
        if (!ids || ids.length === 0) {
          return [];
        }
        return await collectFetchedMessages(
          client.fetch(
            ids,
            { source: true, internalDate: true },
            { uid: true }
          )
        );
      } finally {
        lock.release();
        await client.logout();
      }
    }
  };
}
