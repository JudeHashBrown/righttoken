export type MailboxMessage = {
  providerMessageId: string;
  inReplyTo: string | null;
  references: string[];
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  receivedAt: Date;
};

export type OutboundMailboxMessage = {
  to: string[];
  subject: string;
  text: string;
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
