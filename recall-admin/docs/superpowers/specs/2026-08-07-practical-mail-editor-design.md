# Practical Mail Editor Design

## Goal

Bring the existing mail composer to a practical daily-use baseline without replacing its editor engine or adding advanced desktop-publishing features.

## Scope

The visual editor adds ordered lists, left/center/right alignment, and four fixed font-size choices: small, normal, large, and heading. Existing bold, italic, underline, bullets, links, inline images, HTML source, and preview remain unchanged.

Attachments expand from images only to PDF, Word (`.doc`, `.docx`), and Excel (`.xls`, `.xlsx`). ZIP/RAR and executable formats remain unsupported.

## Attachment Safety and Limits

- Keep the existing private asset storage and authorization model.
- Validate extension, claimed MIME type, and file signature on the server. Never trust the browser `accept` attribute alone.
- Allow PDF, OLE Word/Excel, and OOXML Word/Excel signatures only.
- Limit each non-image attachment to 10 MB.
- Keep the existing message-wide limits of 10 assets and 20 MB total.
- Store document dimensions as `0 x 0` to remain compatible with the current non-null database columns; image dimensions retain their real values.
- Downloads keep `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.

## Editor Behavior

- Ordered list uses the browser's native ordered-list command.
- Alignment offers exactly left, center, and right.
- Font sizes map to email-safe inline pixels: small 12 px, normal 14 px, large 18 px, heading 24 px.
- Formatting is serialized into the existing HTML body and preserved by the current sanitizer.
- Controls use native buttons/selects, visible labels/tooltips, keyboard focus states, and the existing toolbar visual language.

## Error Handling

The upload API returns stable errors for unsupported, oversized, and invalid documents. The composer shows user-facing Chinese messages without exposing storage or parsing details. A failed upload does not alter the email body or existing attachments.

## Testing

- Unit-test document signature validation, file limits, normalized metadata, and storage rollback.
- Unit-test toolbar commands, font-size mapping, attachment selection, and error copy.
- Unit-test that safe alignment/font styles and ordered lists survive HTML processing.
- Run focused tests first, then full unit tests, typecheck, lint, and production build.

## Non-goals

No multi-level numbering, arbitrary fonts or sizes, text/background colors, custom letter/line spacing, archive attachments, malware-scanning service, or editor-framework migration.
