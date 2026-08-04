import { describe, expect, it, vi } from "vitest";
import {
  collectFetchedMessages,
  parsedMailToMailboxMessage,
  smtpImapConfigSchema
} from "@/modules/mail/adapters/smtp-imap";
import { uniqueMailboxMessages } from "@/modules/mail/sync-mailbox";
import { sendSmtpMessage } from "@/modules/integrations/email/smtp-sender";

function mailboxConfig() {
  return smtpImapConfigSchema.parse({
    emailAddress: "support@righttoken.test",
    displayName: "RightToken 客服",
    username: "support@righttoken.test",
    password: "development-only-password",
    smtp: {
      host: "smtp.example.test",
      port: 465,
      secure: true
    },
    imap: {
      host: "imap.example.test",
      port: 993,
      secure: true
    }
  });
}

describe("SMTP/IMAP mailbox adapter", () => {
  it("deduplicates messages with the same provider message id", () => {
    const first = {
      providerMessageId: "<duplicate@example.test>",
      subject: "first"
    };
    const second = {
      ...first,
      subject: "second"
    };

    expect(
      uniqueMailboxMessages([first, second])
    ).toEqual([second]);
  });

  it("continues after one malformed fetched message without logging its content", async () => {
    const onParseFailure = vi.fn();
    const parseMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret raw message"))
      .mockResolvedValueOnce({
        providerMessageId: "<valid@example.test>",
        inReplyTo: null,
        references: [],
        fromAddress: "person@example.test",
        toAddresses: ["support@righttoken.test"],
        subject: "有效邮件",
        bodyText: "有效正文",
        bodyHtml: null,
        attachments: [],
        receivedAt: new Date("2026-07-28T08:00:00.000Z")
      });

    await expect(
      collectFetchedMessages(
        [
          {
            source: Buffer.from("secret raw message"),
            internalDate: new Date("2026-07-28T07:59:00.000Z")
          },
          {
            source: Buffer.from("valid source"),
            internalDate: new Date("2026-07-28T08:00:00.000Z")
          }
        ],
        parseMessage,
        onParseFailure
      )
    ).resolves.toEqual([
      expect.objectContaining({
        providerMessageId: "<valid@example.test>"
      })
    ]);
    expect(onParseFailure).toHaveBeenCalledWith({
      stage: "message_parse",
      code: "IMAP_MESSAGE_PARSE_FAILED"
    });
    expect(JSON.stringify(onParseFailure.mock.calls)).not.toContain(
      "secret raw message"
    );
  });

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
    const config = mailboxConfig();

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
      host: "smtp.example.test",
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
    const config = mailboxConfig();

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
    const config = mailboxConfig();

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
