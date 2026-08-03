import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imapConnect: vi.fn(),
  imapLogout: vi.fn(),
  imapGetMailboxLock: vi.fn(),
  imapSearch: vi.fn(),
  imapFetch: vi.fn(),
  imapLockRelease: vi.fn(),
  smtpVerify: vi.fn(),
  createTransport: vi.fn()
}));

vi.mock("imapflow", () => ({
  ImapFlow: class {
    connect = mocks.imapConnect;
    logout = mocks.imapLogout;
    getMailboxLock = mocks.imapGetMailboxLock;
    search = mocks.imapSearch;
    fetch = mocks.imapFetch;
  }
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport
  }
}));

import {
  createSmtpImapAdapter,
  namecheapMailboxConfig
} from "@/modules/mail/adapters/smtp-imap";

describe("mailbox connection test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imapConnect.mockResolvedValue(undefined);
    mocks.imapLogout.mockResolvedValue(undefined);
    mocks.imapGetMailboxLock.mockResolvedValue({
      release: mocks.imapLockRelease
    });
    mocks.imapSearch.mockResolvedValue([1]);
    mocks.smtpVerify.mockResolvedValue(true);
    mocks.createTransport.mockReturnValue({
      verify: mocks.smtpVerify
    });
  });

  it("verifies both incoming and outgoing connections", async () => {
    const adapter = createSmtpImapAdapter(
      namecheapMailboxConfig({
        emailAddress: "support@righttoken.test",
        displayName: "RightToken 客服",
        username: "support@righttoken.test",
        password: "development-only-password"
      })
    );

    await expect(adapter.testConnection()).resolves.toEqual({
      ok: true
    });
    expect(mocks.imapConnect).toHaveBeenCalledOnce();
    expect(mocks.imapLogout).toHaveBeenCalledOnce();
    expect(mocks.smtpVerify).toHaveBeenCalledOnce();
  });

  it("keeps the IMAP connection open until fetched messages are consumed", async () => {
    let allowFetchToFinish: (() => void) | undefined;
    const fetchCanFinish = new Promise<void>((resolve) => {
      allowFetchToFinish = resolve;
    });
    mocks.imapFetch.mockReturnValue(
      (async function* () {
        await fetchCanFinish;
        yield {
          source: Buffer.from(
            "From: person@example.test\r\n" +
              "To: support@righttoken.test\r\n" +
              "Message-ID: <message@example.test>\r\n" +
              "Subject: Test\r\n\r\nHello"
          ),
          internalDate: new Date("2026-08-03T08:00:00.000Z")
        };
      })()
    );
    const adapter = createSmtpImapAdapter(
      namecheapMailboxConfig({
        emailAddress: "support@righttoken.test",
        displayName: "RightToken 客服",
        username: "support@righttoken.test",
        password: "development-only-password"
      })
    );

    const pending = adapter.listMessagesSince(
      new Date("2026-08-01T00:00:00.000Z")
    );
    await vi.waitFor(() => expect(mocks.imapFetch).toHaveBeenCalledOnce());
    expect(mocks.imapLogout).not.toHaveBeenCalled();

    allowFetchToFinish?.();
    await expect(pending).resolves.toHaveLength(1);
    expect(mocks.imapLockRelease).toHaveBeenCalledOnce();
    expect(mocks.imapLogout).toHaveBeenCalledOnce();
  });
});
