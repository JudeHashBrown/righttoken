import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imapConnect: vi.fn(),
  imapLogout: vi.fn(),
  smtpVerify: vi.fn(),
  createTransport: vi.fn()
}));

vi.mock("imapflow", () => ({
  ImapFlow: class {
    connect = mocks.imapConnect;
    logout = mocks.imapLogout;
  }
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport
  }
}));

import {
  createSmtpImapAdapter,
  smtpImapConfigSchema
} from "@/modules/mail/adapters/smtp-imap";

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

describe("mailbox connection test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imapConnect.mockResolvedValue(undefined);
    mocks.imapLogout.mockResolvedValue(undefined);
    mocks.smtpVerify.mockResolvedValue(true);
    mocks.createTransport.mockReturnValue({
      verify: mocks.smtpVerify
    });
  });

  it("verifies both incoming and outgoing connections", async () => {
    const adapter = createSmtpImapAdapter(
      mailboxConfig()
    );

    await expect(adapter.testConnection()).resolves.toEqual({
      ok: true
    });
    expect(mocks.imapConnect).toHaveBeenCalledOnce();
    expect(mocks.imapLogout).toHaveBeenCalledOnce();
    expect(mocks.smtpVerify).toHaveBeenCalledOnce();
  });
});
