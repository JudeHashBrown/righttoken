import sanitizeHtml from "sanitize-html";

const assetIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function plainTextToMailHtml(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`)
    .join("");
}

export function sanitizeMailHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "blockquote",
      "a",
      "img"
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["data-mail-asset-id", "alt"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"]
    },
    transformTags: {
      img: (_tagName, attributes) => {
        const assetId = attributes["data-mail-asset-id"] ?? "";
        return {
          tagName: "img",
          attribs: assetIdPattern.test(assetId)
            ? {
                "data-mail-asset-id": assetId,
                ...(attributes.alt
                  ? { alt: attributes.alt.slice(0, 300) }
                  : {})
              }
            : {}
        };
      }
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" &&
      !assetIdPattern.test(
        frame.attribs["data-mail-asset-id"] ?? ""
      )
  }).trim();
}

export function mailHtmlToText(value: string): string {
  const safe = sanitizeMailHtml(value)
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/(?:p|li|blockquote)>/gi, "\n");
  return sanitizeHtml(safe, {
    allowedTags: [],
    allowedAttributes: {}
  })
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function mailAssetIdsInHtml(value: string): string[] {
  const ids = Array.from(
    sanitizeMailHtml(value).matchAll(
      /data-mail-asset-id="([A-Za-z0-9_-]{1,128})"/g
    ),
    (match) => match[1]
  );
  return [...new Set(ids)];
}
