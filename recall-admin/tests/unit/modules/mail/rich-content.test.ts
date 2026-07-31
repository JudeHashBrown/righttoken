import { describe, expect, it } from "vitest";
import {
  mailHtmlToText,
  sanitizeMailHtml
} from "@/modules/mail/rich-content";

describe("safe mail HTML", () => {
  it("keeps useful formatting, inline assets, and HTTPS images", () => {
    const result = sanitizeMailHtml(`
      <p>你好，<strong>欢迎使用</strong></p>
      <ul><li>第一步</li></ul>
      <img
        data-mail-asset-id="asset-1"
        alt="操作说明"
        src="https://tracker.example/pixel"
        onerror="alert(1)"
      >
    `);

    expect(result).toContain("<strong>欢迎使用</strong>");
    expect(result).toContain("<ul><li>第一步</li></ul>");
    expect(result).toContain('data-mail-asset-id="asset-1"');
    expect(result).toContain('alt="操作说明"');
    expect(result).toContain("https://tracker.example/pixel");
    expect(result).not.toContain("onerror");
  });

  it("removes active content, unsafe styles, and unsafe links", () => {
    const result = sanitizeMailHtml(`
      <script>alert(1)</script>
      <form><input value="secret"></form>
      <iframe src="https://unsafe.example"></iframe>
      <p style="background:expression(alert(2))">正文</p>
      <a href="javascript:alert(1)">危险链接</a>
    `);

    expect(result).not.toMatch(
      /script|form|input|iframe|expression|javascript:/i
    );
    expect(result).toContain("正文");
    expect(result).toContain("危险链接");
  });

  it("creates a readable plain-text fallback", () => {
    expect(
      mailHtmlToText(
        "<p>第一段<br>下一行</p><ul><li>项目一</li><li>项目二</li></ul>"
      )
    ).toBe("第一段\n下一行\n项目一\n项目二");
  });
});
