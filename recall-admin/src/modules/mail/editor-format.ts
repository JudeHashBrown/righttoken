export const MAIL_FONT_SIZE_OPTIONS = [
  { label: "小", value: "12px", legacySize: "1" },
  { label: "正常", value: "14px", legacySize: "3" },
  { label: "大", value: "18px", legacySize: "5" },
  { label: "标题", value: "24px", legacySize: "6" }
] as const;

export type MailFontSize =
  (typeof MAIL_FONT_SIZE_OPTIONS)[number]["value"];

export type MailEditorFormat =
  | {
      type:
        | "orderedList"
        | "alignLeft"
        | "alignCenter"
        | "alignRight";
    }
  | { type: "fontSize"; value: MailFontSize };

const browserCommands = {
  orderedList: "insertOrderedList",
  alignLeft: "justifyLeft",
  alignCenter: "justifyCenter",
  alignRight: "justifyRight"
} as const;

const pixelsByLegacySize = new Map(
  MAIL_FONT_SIZE_OPTIONS.map((option) => [
    option.legacySize,
    option.value
  ])
);

export function normalizeLegacyFontElements(
  editor: HTMLElement
): void {
  for (const font of Array.from(editor.querySelectorAll("font[size]"))) {
    const legacySize = font.getAttribute("size");
    const pixels = legacySize
      ? pixelsByLegacySize.get(
          legacySize as (typeof MAIL_FONT_SIZE_OPTIONS)[number]["legacySize"]
        )
      : undefined;
    if (!pixels) {
      font.replaceWith(...Array.from(font.childNodes));
      continue;
    }
    const span = document.createElement("span");
    span.style.fontSize = pixels;
    span.append(...Array.from(font.childNodes));
    font.replaceWith(span);
  }
}

export function applyMailEditorFormat(
  editor: HTMLElement,
  format: MailEditorFormat
): boolean {
  if (typeof document.execCommand !== "function") {
    return false;
  }
  if (format.type === "fontSize") {
    const option = MAIL_FONT_SIZE_OPTIONS.find(
      (candidate) => candidate.value === format.value
    );
    if (!option) return false;
    const applied = document.execCommand(
      "fontSize",
      false,
      option.legacySize
    );
    normalizeLegacyFontElements(editor);
    return applied;
  }
  return document.execCommand(
    browserCommands[format.type],
    false,
    undefined
  );
}
