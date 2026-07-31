import { describe, expect, it } from "vitest";
import {
  processMailHtml
} from "@/modules/mail/html-policy";

describe("processMailHtml", () => {
  it("preserves a complete static email document", () => {
    const result = processMailHtml(`<!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width">
          <style>
            .card { color: #2563eb; }
            @media (max-width: 600px) {
              .card { width: 100% !important; }
            }
          </style>
        </head>
        <body>
          <table role="presentation" style="width:100%">
            <tr><td class="card">你好</td></tr>
          </table>
        </body>
      </html>`);

    expect(result.html).toMatch(/^<!DOCTYPE html>/i);
    expect(result.html).toContain("<html>");
    expect(result.html).toContain("<head>");
    expect(result.html).toContain("@media");
    expect(result.html).toContain("<table");
    expect(result.text).toBe("你好");
    expect(result.diagnostics.hasDangerousContent).toBe(false);
  });

  it("removes active content and dangerous URLs", () => {
    const result = processMailHtml(`
      <script>alert(1)</script>
      <form><input value="secret"></form>
      <iframe src="https://example.test"></iframe>
      <a href="javascript:alert(1)" onclick="alert(2)">危险链接</a>
      <p style="background:expression(alert(3))">正文</p>
      <style>@import "https://evil.example/style.css";</style>
    `);

    expect(result.html).not.toMatch(
      /script|form|input|iframe|onclick|javascript:|expression|@import/i
    );
    expect(result.diagnostics.hasDangerousContent).toBe(true);
    expect(result.diagnostics.blockedUrls).toBeGreaterThan(0);
    expect(result.diagnostics.removedTags).toEqual(
      expect.arrayContaining(["form", "iframe", "input", "script"])
    );
  });

  it("allows https images and rejects other external sources", () => {
    const result = processMailHtml(`
      <img src="https://cdn.example.test/guide.png" alt="guide">
      <img src="http://cdn.example.test/insecure.png">
      <img src="file:///tmp/private.png">
      <img data-mail-asset-id="asset_1" alt="upload">
    `);

    expect(result.html).toContain(
      "https://cdn.example.test/guide.png"
    );
    expect(result.html).not.toContain("http://");
    expect(result.html).not.toContain("file://");
    expect(result.html).toContain(
      'data-mail-asset-id="asset_1"'
    );
    expect(result.diagnostics.externalImageCount).toBe(1);
    expect(result.diagnostics.blockedUrls).toBe(2);
  });

  it("rejects local and private-network HTTPS sources", () => {
    const result = processMailHtml(`
      <img src="https://localhost/tracker.png">
      <img src="https://127.0.0.1/tracker.png">
      <img src="https://192.168.1.10/tracker.png">
      <style>
        .private { background-image: url("https://10.0.0.8/bg.png"); }
      </style>
    `);

    expect(result.html).not.toMatch(
      /localhost|127\.0\.0\.1|192\.168\.1\.10|10\.0\.0\.8/
    );
    expect(result.diagnostics.externalImageCount).toBe(0);
    expect(result.diagnostics.blockedUrls).toBe(4);
  });

  it("removes non-https CSS URLs while keeping safe styles", () => {
    const result = processMailHtml(`
      <style>
        .safe { background-image: url("https://cdn.example.test/bg.png"); }
        .unsafe { background-image: url("http://internal.test/bg.png"); }
      </style>
      <p style="color:#123456; background:url(javascript:alert(1))">正文</p>
    `);

    expect(result.html).toContain(
      "https://cdn.example.test/bg.png"
    );
    expect(result.html).toContain("color:#123456");
    expect(result.html).not.toContain("http://internal");
    expect(result.html).not.toContain("javascript:");
  });

  it("marks complex documents as unsafe for lossless visual editing", () => {
    expect(
      processMailHtml("<p>简单正文</p>").visualEditorCompatible
    ).toBe(true);
    expect(
      processMailHtml(
        "<html><head><style>.x{color:red}</style></head><body><table><tr><td>复杂</td></tr></table></body></html>"
      ).visualEditorCompatible
    ).toBe(false);
  });
});
