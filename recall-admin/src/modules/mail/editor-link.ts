export type EditorLinkResult =
  | { ok: true; href: string }
  | {
      ok: false;
      code: "EMPTY_LINK" | "UNSAFE_LINK" | "INVALID_LINK";
    };

const schemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export function normalizeEditorLink(
  raw: string
): EditorLinkResult {
  const value = raw.trim();
  if (!value) {
    return { ok: false, code: "EMPTY_LINK" };
  }
  const candidate = schemePattern.test(value)
    ? value
    : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, code: "INVALID_LINK" };
  }
  if (url.protocol !== "https:" && url.protocol !== "mailto:") {
    return { ok: false, code: "UNSAFE_LINK" };
  }
  if (
    (url.protocol === "https:" && !url.hostname) ||
    (url.protocol === "mailto:" && !url.pathname.includes("@"))
  ) {
    return { ok: false, code: "INVALID_LINK" };
  }
  return { ok: true, href: url.toString() };
}
