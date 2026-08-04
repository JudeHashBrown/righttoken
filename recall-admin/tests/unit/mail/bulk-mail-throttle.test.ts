import { describe, expect, it } from "vitest";
import {
  randomBulkMailDelayMs,
  senderDomainFromAddress
} from "@/modules/mail/bulk-mail-throttle";

describe("bulk mail throttle rules", () => {
  it("normalizes every mailbox on the same sender domain", () => {
    expect(senderDomainFromAddress(" Alisa@RightToken.AI ")).toBe(
      "righttoken.ai"
    );
    expect(senderDomainFromAddress("contact@righttoken.ai")).toBe(
      "righttoken.ai"
    );
  });

  it("rejects an address without a usable sender domain", () => {
    expect(() => senderDomainFromAddress("invalid-address")).toThrow(
      "INVALID_SENDER_ADDRESS"
    );
  });

  it("returns an inclusive random delay from 120 through 240 seconds", () => {
    expect(randomBulkMailDelayMs(() => 0)).toBe(120_000);
    expect(randomBulkMailDelayMs(() => 0.5)).toBe(180_000);
    expect(randomBulkMailDelayMs(() => 0.999_999)).toBe(240_000);
  });
});
