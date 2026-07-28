export type MailboxMessage = {
  providerMessageId: string;
  inReplyTo: string | null;
  references: string[];
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  attachments: Array<{
    fileName: string;
    contentType: string;
    content: Buffer;
    cid: string | null;
    disposition: "INLINE" | "ATTACHMENT";
  }>;
  receivedAt: Date;
};

export type OutboundMailboxMessage = {
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
};

export interface MailboxAdapter {
  testConnection(): Promise<{ ok: true }>;
  send(
    message: OutboundMailboxMessage
  ): Promise<{ providerMessageId: string }>;
  listMessagesSince(since: Date): Promise<MailboxMessage[]>;
}
