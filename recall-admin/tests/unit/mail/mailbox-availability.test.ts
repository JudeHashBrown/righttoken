import { describe, expect, it } from "vitest";
import { isConfiguredMailbox } from "@/modules/mail/mailbox-availability";

describe("isConfiguredMailbox", () => {
  it("accepts a mailbox with encrypted credentials and no deletion marker", () => {
    expect(
      isConfiguredMailbox({
        encryptedConfig: "ciphertext",
        configurationDeletedAt: null
      })
    ).toBe(true);
  });

  it("rejects a mailbox after configuration removal", () => {
    expect(
      isConfiguredMailbox({
        encryptedConfig: null,
        configurationDeletedAt: new Date()
      })
    ).toBe(false);
  });
});
