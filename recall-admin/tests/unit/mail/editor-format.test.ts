// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyMailEditorFormat,
  MAIL_FONT_SIZE_OPTIONS,
  normalizeLegacyFontElements
} from "@/modules/mail/editor-format";

describe("mail editor formatting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes exactly four email-safe font sizes", () => {
    expect(MAIL_FONT_SIZE_OPTIONS).toEqual([
      { label: "小", value: "12px", legacySize: "1" },
      { label: "正常", value: "14px", legacySize: "3" },
      { label: "大", value: "18px", legacySize: "5" },
      { label: "标题", value: "24px", legacySize: "6" }
    ]);
  });

  it.each([
    ["orderedList", "insertOrderedList"],
    ["alignLeft", "justifyLeft"],
    ["alignCenter", "justifyCenter"],
    ["alignRight", "justifyRight"]
  ] as const)("maps %s to %s", (format, browserCommand) => {
    const editor = document.createElement("div");
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    applyMailEditorFormat(editor, { type: format });

    expect(execCommand).toHaveBeenCalledWith(
      browserCommand,
      false,
      undefined
    );
  });

  it("applies a fixed font size and replaces legacy font tags", () => {
    const editor = document.createElement("div");
    editor.innerHTML = '<font size="5">重要内容</font>';
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });

    applyMailEditorFormat(editor, {
      type: "fontSize",
      value: "18px"
    });

    expect(execCommand).toHaveBeenCalledWith("fontSize", false, "5");
    expect(editor.innerHTML).toBe(
      '<span style="font-size: 18px;">重要内容</span>'
    );
  });

  it("unwraps unknown legacy font sizes instead of preserving them", () => {
    const editor = document.createElement("div");
    editor.innerHTML = '<font size="99">正文</font>';

    normalizeLegacyFontElements(editor);

    expect(editor.innerHTML).toBe("正文");
  });
});
