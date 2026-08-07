import { describe, expect, it } from "vitest";
import {
  MAX_MAIL_DOCUMENT_BYTES,
  MailDocumentError,
  normalizeMailDocument
} from "@/modules/mail/assets/document-normalizer";

const oleHeader = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1
]);

function ooxml(marker: "word/" | "xl/"): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(`[Content_Types].xml\0${marker}document.xml`)
  ]);
}

describe("normalizeMailDocument", () => {
  it("accepts a PDF with a matching extension and MIME type", () => {
    const result = normalizeMailDocument({
      bytes: Buffer.from("%PDF-1.7\nbody"),
      fileName: "报价单.PDF",
      claimedContentType: "application/pdf"
    });

    expect(result).toMatchObject({
      contentType: "application/pdf",
      extension: "pdf",
      byteSize: 13,
      width: 0,
      height: 0
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    [
      "contract.doc",
      "application/msword",
      oleHeader,
      "doc"
    ],
    [
      "budget.xls",
      "application/vnd.ms-excel",
      oleHeader,
      "xls"
    ],
    [
      "contract.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ooxml("word/"),
      "docx"
    ],
    [
      "budget.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ooxml("xl/"),
      "xlsx"
    ]
  ])("accepts %s when its signature matches", (
    fileName,
    claimedContentType,
    bytes,
    extension
  ) => {
    expect(
      normalizeMailDocument({
        bytes,
        fileName,
        claimedContentType
      })
    ).toMatchObject({ extension });
  });

  it("rejects an OOXML file whose package family mismatches its extension", () => {
    expect(() =>
      normalizeMailDocument({
        bytes: ooxml("xl/"),
        fileName: "fake.docx",
        claimedContentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      })
    ).toThrowError(
      expect.objectContaining<Partial<MailDocumentError>>({
        code: "MAIL_FILE_INVALID"
      })
    );
  });

  it("rejects unsupported extensions", () => {
    expect(() =>
      normalizeMailDocument({
        bytes: Buffer.from("PK archive"),
        fileName: "archive.zip",
        claimedContentType: "application/zip"
      })
    ).toThrowError(
      expect.objectContaining<Partial<MailDocumentError>>({
        code: "MAIL_FILE_UNSUPPORTED"
      })
    );
  });

  it("rejects a claimed MIME type that does not match the extension", () => {
    expect(() =>
      normalizeMailDocument({
        bytes: Buffer.from("%PDF-1.7\nbody"),
        fileName: "invoice.pdf",
        claimedContentType: "application/msword"
      })
    ).toThrowError(
      expect.objectContaining<Partial<MailDocumentError>>({
        code: "MAIL_FILE_INVALID"
      })
    );
  });

  it("rejects documents larger than 10 MB", () => {
    expect(() =>
      normalizeMailDocument({
        bytes: Buffer.alloc(MAX_MAIL_DOCUMENT_BYTES + 1),
        fileName: "large.pdf",
        claimedContentType: "application/pdf"
      })
    ).toThrowError(
      expect.objectContaining<Partial<MailDocumentError>>({
        code: "MAIL_FILE_TOO_LARGE"
      })
    );
  });
});
