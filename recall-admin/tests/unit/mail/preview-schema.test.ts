import { describe, expect, it } from "vitest";
import {
  mailPreviewRequestSchema
} from "@/modules/mail/preview-schema";

describe("mailPreviewRequestSchema", () => {
  it("accepts source HTML and asset references", () => {
    expect(
      mailPreviewRequestSchema.safeParse({
        subject: "欢迎回来",
        bodyHtml: "<p>你好，[称呼]</p>",
        assets: [
          {
            id: "asset-1",
            disposition: "INLINE",
            sortOrder: 0
          }
        ]
      }).success
    ).toBe(true);
  });

  it("rejects unknown request fields", () => {
    expect(
      mailPreviewRequestSchema.safeParse({
        subject: "欢迎",
        bodyHtml: "<p>正文</p>",
        extra: true
      }).success
    ).toBe(false);
  });
});
