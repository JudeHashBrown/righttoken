import {
  processMailHtml
} from "@/modules/mail/html-policy";

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
  return processMailHtml(value).html;
}

export function mailHtmlToText(value: string): string {
  return processMailHtml(value).text;
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
