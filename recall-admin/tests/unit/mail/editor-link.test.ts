import { describe, expect, it } from "vitest";
import { normalizeEditorLink } from "@/modules/mail/editor-link";

describe("normalizeEditorLink", () => {
  it.each([
    ["example.com/path", "https://example.com/path"],
    ["https://example.com/path", "https://example.com/path"],
    ["mailto:help@example.com", "mailto:help@example.com"]
  ])("normalizes %s", (raw, href) => {
    expect(normalizeEditorLink(raw)).toEqual({ ok: true, href });
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "ftp://example.com/file"
  ])("rejects unsafe scheme %s", (raw) => {
    expect(normalizeEditorLink(raw)).toEqual({
      ok: false,
      code: "UNSAFE_LINK"
    });
  });

  it("distinguishes empty and malformed links", () => {
    expect(normalizeEditorLink("  ")).toEqual({
      ok: false,
      code: "EMPTY_LINK"
    });
    expect(normalizeEditorLink("https://" )).toEqual({
      ok: false,
      code: "INVALID_LINK"
    });
  });
});
