import { describe, expect, it, vi } from "vitest";
import {
  namecheapMailboxConfig,
  smtpImapConfigSchema
} from "@/modules/mail/adapters/smtp-imap";
import { sendSmtpMessage } from "@/modules/integrations/email/smtp-sender";

describe("SMTP/IMAP mailbox adapter", () => {
  it("uses Namecheap Private Email SSL defaults", () => {
    expect(
      namecheapMailboxConfig({
        emailAddress: "support@righttoken.test",
        displayName: "RightToken 客服",
        username: "support@righttoken.test",
        password: "development-only-password"
      })
    ).toMatchObject({
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
  });

  it("rejects incomplete server configuration", () => {
    expect(() =>
      smtpImapConfigSchema.parse({
        emailAddress: "support@righttoken.test"
      })
    ).toThrow();
  });

  it("sends through the configured SMTP server without logging credentials", async () => {
    const sendMail = vi.fn().mockResolvedValue({
      messageId: "<provider-message-id@example.test>"
    });
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const config = namecheapMailboxConfig({
      emailAddress: "support@righttoken.test",
      displayName: "RightToken 客服",
      username: "support@righttoken.test",
      password: "development-only-password"
    });

    await expect(
      sendSmtpMessage(
        config,
        {
          to: ["person@example.test"],
          subject: "测试邮件",
          text: "这是一封测试邮件。"
        },
        createTransport
      )
    ).resolves.toEqual({
      providerMessageId: "<provider-message-id@example.test>"
    });
    expect(createTransport).toHaveBeenCalledWith({
      host: "mail.privateemail.com",
      port: 465,
      secure: true,
      auth: {
        user: "support@righttoken.test",
        pass: "development-only-password"
      },
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000
    });
  });

  it("preserves standard thread headers when replying", async () => {
    const sendMail = vi.fn().mockResolvedValue({
      messageId: "<reply@example.test>"
    });
    const config = namecheapMailboxConfig({
      emailAddress: "support@righttoken.test",
      displayName: "RightToken 客服",
      username: "support@righttoken.test",
      password: "development-only-password"
    });

    await sendSmtpMessage(
      config,
      {
        to: ["person@example.test"],
        subject: "Re: 支付协助",
        text: "我们已经收到你的问题。",
        inReplyTo: "<inbound@example.test>",
        references: [
          "<outbound@example.test>",
          "<inbound@example.test>"
        ]
      },
      vi.fn().mockReturnValue({ sendMail })
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        inReplyTo: "<inbound@example.test>",
        references: [
          "<outbound@example.test>",
          "<inbound@example.test>"
        ]
      })
    );
  });
});
