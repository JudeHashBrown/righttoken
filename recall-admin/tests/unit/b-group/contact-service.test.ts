import { describe, expect, it } from "vitest";
import {
  contactInputSchema,
  normalizeContact
} from "@/modules/b-group/contact-service";

describe("B-group contact normalization", () => {
  it("normalizes Telegram and phone fields", () => {
    expect(
      normalizeContact({
        wechatId: " right-token ",
        telegramHandle: "  righttoken_user  ",
        phoneCountryCode: " 65 ",
        phoneNumber: "1234 5678"
      })
    ).toEqual({
      wechatId: "right-token",
      telegramHandle: "@righttoken_user",
      phoneCountryCode: "+65",
      phoneNumber: "12345678"
    });
  });

  it("requires at least one contact method", () => {
    expect(
      contactInputSchema.safeParse({
        wechatId: "",
        telegramHandle: "",
        phoneCountryCode: "",
        phoneNumber: ""
      }).success
    ).toBe(false);
  });

  it("rejects a phone number without a country code", () => {
    expect(
      contactInputSchema.safeParse({
        wechatId: "",
        telegramHandle: "",
        phoneCountryCode: "",
        phoneNumber: "12345678"
      }).success
    ).toBe(false);
  });
});
