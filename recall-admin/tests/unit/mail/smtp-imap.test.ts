import { describe, expect, it, vi } from "vitest";
import {
  namecheapMailboxConfig,
  parsedMailToMailboxMessage,
  smtpImapConfigSchema
} from "@/modules/mail/adapters/smtp-imap";
import { sendSmtpMessage } from "@/modules/integrations/email/smtp-sender";

describe("SMTP/IMAP mailbox adapter", () => {
  it("keeps incoming HTML and image attachments for safe ingestion", () => {
    expect(
      parsedMailToMailboxMessage(
        {
          messageId: "<incoming-rich@example.test>",
          inReplyTo: "<outbound@example.test>",
          references: ["<outbound@example.test>"],
          from: {
            value: [
              {
                address: "person@example.test",
                name: "Person"
              }
            ],
            text: "Person <person@example.test>",
            html: ""
          },
          to: {
            value: [
              {
                address: "support@righttoken.test",
                name: "Support"
              }
            ],
            text: "support@righttoken.test",
            html: ""
          },
          subject: "带图片的来信",
          text: "请查看截图。",
          html:
            '<p>请查看截图。</p><img src="cid:screenshot@example.test">',
          date: new Date("2026-07-28T08:00:00.000Z"),
          attachments: [
            {
              filename: "screenshot.png",
              contentType: "image/png",
              content: Buffer.from("image"),
              cid: "screenshot@example.test",
              contentDisposition: "inline"
            }
          ]
        },
        new Date("2026-07-28T08:01:00.000Z")
      )
    ).toMatchObject({
      providerMessageId: "<incoming-rich@example.test>",
      bodyHtml:
        '<p>请查看截图。</p><img src="cid:screenshot@example.test">',
      attachments: [
        {
          fileName: "screenshot.png",
          contentType: "image/png",
          cid: "screenshot@example.test",
          disposition: "INLINE"
        }
      ]
    });
  });

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

  it("sends HTML, CID images, and ordinary image attachments", async () => {
    const sendMail = vi.fn().mockResolvedValue({
      messageId: "<rich-mail@example.test>"
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
        subject: "图片说明",
        text: "请查看说明图片。",
        html: '<p>请查看说明图片。</p><img src="cid:inline@righttoken">',
        attachments: [
          {
            filename: "guide.webp",
            content: Buffer.from("inline"),
            contentType: "image/webp",
            cid: "inline@righttoken",
            contentDisposition: "inline"
          },
          {
            filename: "receipt.png",
            content: Buffer.from("attachment"),
            contentType: "image/png",
            contentDisposition: "attachment"
          }
        ]
      },
      vi.fn().mockReturnValue({ sendMail })
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("cid:inline@righttoken"),
        attachments: [
          expect.objectContaining({
            cid: "inline@righttoken",
            contentDisposition: "inline"
          }),
          expect.objectContaining({
            filename: "receipt.png",
            contentDisposition: "attachment"
          })
        ]
      })
    );
  });
});
