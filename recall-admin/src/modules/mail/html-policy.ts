import sanitizeHtml from "sanitize-html";

export type MailHtmlDiagnostics = {
  removedTags: string[];
  removedAttributes: string[];
  blockedUrls: number;
  externalImageCount: number;
  hasDangerousContent: boolean;
};

export type ProcessedMailHtml = {
  html: string;
  text: string;
  diagnostics: MailHtmlDiagnostics;
  visualEditorCompatible: boolean;
};

const allowedTags = [
  "html",
  "head",
  "body",
  "title",
  "meta",
  "style",
  "div",
  "section",
  "header",
  "footer",
  "main",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "span",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "img",
  "table",
  "caption",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td"
] as const;

const allowedTagSet = new Set<string>(allowedTags);
const activeTags = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  "video",
  "audio",
  "svg",
  "math",
  "link",
  "base"
]);
const assetIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const dangerousCssPattern =
  /expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding\s*:|@import\b/i;
const complexVisualTagPattern =
  /<(?:html|head|body|title|meta|style|table|caption|colgroup|col|thead|tbody|tfoot|tr|th|td)\b/i;
const urlPattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeLinkUrl(value: string): boolean {
  if (value.startsWith("#")) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function sanitizeCssUrls(value: string): string {
  return value.replace(
    urlPattern,
    (match, doubleQuoted, singleQuoted, unquoted) => {
      const raw = String(
        doubleQuoted ?? singleQuoted ?? unquoted ?? ""
      ).trim();
      return isSafeHttpsUrl(raw) ? match : "";
    }
  );
}

function sanitizeStyleAttribute(value: string): string {
  return value
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => !dangerousCssPattern.test(declaration))
    .map(sanitizeCssUrls)
    .filter((declaration) => {
      const colon = declaration.indexOf(":");
      return colon > 0 && declaration.slice(colon + 1).trim().length > 0;
    })
    .join("; ");
}

function sanitizeStyleSheet(value: string): string {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutImports = withoutComments.replace(
    /@import\b[^;]*(?:;|$)/gi,
    ""
  );
  return sanitizeCssUrls(withoutImports)
    .replace(
      /(?:^|[;{])\s*[^;{}]*(?:expression\s*\(|javascript\s*:|vbscript\s*:|behavior\s*:|-moz-binding\s*:)[^;}]*(?:;|(?=}))/gi,
      (match) => (match.startsWith("{") ? "{" : "")
    )
    .trim();
}

function sanitizeStyleElements(value: string): string {
  return value.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, opening, css, closing) =>
      `${opening}${sanitizeStyleSheet(String(css))}${closing}`
  );
}

function collectDiagnostics(input: string): MailHtmlDiagnostics {
  const removedTags: string[] = [];
  const removedAttributes: string[] = [];
  let blockedUrls = 0;
  let externalImageCount = 0;

  for (const match of input.matchAll(
    /<\s*\/?\s*([A-Za-z][A-Za-z0-9:-]*)\b/g
  )) {
    const tag = match[1].toLowerCase();
    if (!allowedTagSet.has(tag)) {
      removedTags.push(tag);
    }
  }
  for (const match of input.matchAll(
    /\s(on[A-Za-z0-9_-]+)\s*=/g
  )) {
    removedAttributes.push(match[1].toLowerCase());
  }
  for (const match of input.matchAll(
    /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  )) {
    const fullMatch = match[0];
    const value = String(match[1] ?? match[2] ?? match[3] ?? "").trim();
    const isImage = /^src/i.test(fullMatch);
    const safe = isImage
      ? isSafeHttpsUrl(value)
      : isSafeLinkUrl(value);
    if (!safe) {
      blockedUrls += 1;
    } else if (isImage) {
      externalImageCount += 1;
    }
  }
  for (const match of input.matchAll(urlPattern)) {
    const value = String(
      match[1] ?? match[2] ?? match[3] ?? ""
    ).trim();
    if (!isSafeHttpsUrl(value)) {
      blockedUrls += 1;
    }
  }
  const cssDangerous = dangerousCssPattern.test(input);
  return {
    removedTags: uniqueSorted(removedTags),
    removedAttributes: uniqueSorted(removedAttributes),
    blockedUrls,
    externalImageCount,
    hasDangerousContent:
      removedTags.length > 0 ||
      removedAttributes.length > 0 ||
      blockedUrls > 0 ||
      cssDangerous
  };
}

function transformAttributes(
  tagName: string,
  attributes: Record<string, string>,
  allowExternalImages: boolean
): Record<string, string> {
  const next = { ...attributes };
  for (const name of Object.keys(next)) {
    if (name.toLowerCase().startsWith("on")) {
      delete next[name];
    }
  }
  if (next.style) {
    const style = sanitizeStyleAttribute(next.style);
    if (style) {
      next.style = style;
    } else {
      delete next.style;
    }
  }
  if (tagName === "a" && next.href && !isSafeLinkUrl(next.href)) {
    delete next.href;
  }
  if (tagName === "a" && next.target === "_blank") {
    next.rel = "noopener noreferrer";
  }
  if (tagName === "img") {
    const assetId = next["data-mail-asset-id"] ?? "";
    const safeAsset = assetIdPattern.test(assetId);
    const safeExternal =
      allowExternalImages &&
      next.src &&
      isSafeHttpsUrl(next.src);
    if (!safeAsset) {
      delete next["data-mail-asset-id"];
    }
    if (!safeExternal) {
      delete next.src;
    }
    if (!safeAsset && !safeExternal) {
      next.alt = next.alt?.slice(0, 300) ?? "";
    }
  }
  if (tagName === "meta") {
    const httpEquiv = next["http-equiv"]?.toLowerCase();
    if (httpEquiv && httpEquiv !== "content-type") {
      delete next["http-equiv"];
      delete next.content;
    }
  }
  return next;
}

function mailHtmlToPlainText(html: string): string {
  const withoutNonText = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, " ");
  return sanitizeHtml(withoutNonText, {
    allowedTags: [],
    allowedAttributes: {}
  })
    .replaceAll("\u00a0", " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function processMailHtml(
  input: string,
  options: { allowExternalImages?: boolean } = {}
): ProcessedMailHtml {
  const allowExternalImages =
    options.allowExternalImages ?? true;
  const source = input.trim();
  const hasDoctype = /^<!doctype\s+html\s*>/i.test(source);
  const withoutDoctype = source.replace(
    /^<!doctype\s+html\s*>/i,
    ""
  );
  const diagnostics = collectDiagnostics(withoutDoctype);
  const safeStyleSource = sanitizeStyleElements(withoutDoctype);
  const cleaned = sanitizeHtml(safeStyleSource, {
    allowedTags: [...allowedTags],
    allowedAttributes: {
      "*": [
        "class",
        "id",
        "style",
        "title",
        "role",
        "dir",
        "lang",
        "align",
        "valign",
        "width",
        "height",
        "bgcolor",
        "aria-*"
      ],
      a: ["href", "target", "rel", "name"],
      img: [
        "src",
        "alt",
        "width",
        "height",
        "data-mail-asset-id"
      ],
      table: [
        "border",
        "cellpadding",
        "cellspacing",
        "summary"
      ],
      col: ["span"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      meta: ["name", "content", "charset", "http-equiv"]
    },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: {
      a: ["https", "mailto"],
      img: ["https"]
    },
    allowProtocolRelative: false,
    allowVulnerableTags: true,
    enforceHtmlBoundary: false,
    transformTags: {
      "*": (tagName, attributes) => ({
        tagName,
        attribs: transformAttributes(
          tagName,
          attributes,
          allowExternalImages
        )
      })
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" &&
      !frame.attribs.src &&
      !assetIdPattern.test(
        frame.attribs["data-mail-asset-id"] ?? ""
      )
  }).trim();
  const html = `${hasDoctype ? "<!DOCTYPE html>" : ""}${cleaned}`;
  return {
    html,
    text: mailHtmlToPlainText(cleaned),
    diagnostics,
    visualEditorCompatible:
      !complexVisualTagPattern.test(cleaned) &&
      !/\s(?:style|class|id)=/i.test(cleaned) &&
      !/<img\b[^>]*\bsrc=/i.test(cleaned)
  };
}
