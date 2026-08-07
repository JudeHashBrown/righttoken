import { createHash } from "node:crypto";
import path from "node:path";

export const MAX_MAIL_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type MailDocumentErrorCode =
  | "MAIL_FILE_UNSUPPORTED"
  | "MAIL_FILE_TOO_LARGE"
  | "MAIL_FILE_INVALID";

export class MailDocumentError extends Error {
  constructor(readonly code: MailDocumentErrorCode) {
    super(code);
    this.name = "MailDocumentError";
  }
}

type DocumentExtension = "pdf" | "doc" | "docx" | "xls" | "xlsx";

type DocumentSpec = {
  contentType: string;
  claimedTypes: ReadonlySet<string>;
  signature: "PDF" | "OLE" | "WORD_OOXML" | "EXCEL_OOXML";
};

const specs: Record<DocumentExtension, DocumentSpec> = {
  pdf: {
    contentType: "application/pdf",
    claimedTypes: new Set(["application/pdf"]),
    signature: "PDF"
  },
  doc: {
    contentType: "application/msword",
    claimedTypes: new Set(["application/msword"]),
    signature: "OLE"
  },
  docx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    claimedTypes: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]),
    signature: "WORD_OOXML"
  },
  xls: {
    contentType: "application/vnd.ms-excel",
    claimedTypes: new Set(["application/vnd.ms-excel"]),
    signature: "OLE"
  },
  xlsx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    claimedTypes: new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]),
    signature: "EXCEL_OOXML"
  }
};

const oleHeader = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1
]);
const zipHeaders = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08])
];

function startsWith(bytes: Buffer, header: Buffer): boolean {
  return bytes.length >= header.length &&
    bytes.subarray(0, header.length).equals(header);
}

function hasOoxmlMarkers(
  bytes: Buffer,
  family: "word/" | "xl/"
): boolean {
  if (!zipHeaders.some((header) => startsWith(bytes, header))) {
    return false;
  }
  const packageIndex = bytes.indexOf("[Content_Types].xml");
  const familyIndex = bytes.indexOf(family);
  return packageIndex >= 0 && familyIndex >= 0;
}

function hasSignature(
  bytes: Buffer,
  signature: DocumentSpec["signature"]
): boolean {
  if (signature === "PDF") {
    return startsWith(bytes, Buffer.from("%PDF-"));
  }
  if (signature === "OLE") {
    return startsWith(bytes, oleHeader);
  }
  return hasOoxmlMarkers(
    bytes,
    signature === "WORD_OOXML" ? "word/" : "xl/"
  );
}

export type NormalizedMailDocument = {
  bytes: Buffer;
  contentType: string;
  extension: DocumentExtension;
  byteSize: number;
  width: 0;
  height: 0;
  sha256: string;
};

export function normalizeMailDocument(input: {
  bytes: Buffer;
  fileName: string;
  claimedContentType?: string;
}): NormalizedMailDocument {
  if (input.bytes.length > MAX_MAIL_DOCUMENT_BYTES) {
    throw new MailDocumentError("MAIL_FILE_TOO_LARGE");
  }
  if (input.bytes.length === 0) {
    throw new MailDocumentError("MAIL_FILE_INVALID");
  }

  const extension = path
    .extname(input.fileName)
    .slice(1)
    .toLowerCase() as DocumentExtension;
  const spec = specs[extension];
  if (!spec) {
    throw new MailDocumentError("MAIL_FILE_UNSUPPORTED");
  }

  const claimed = input.claimedContentType?.trim().toLowerCase();
  if (
    claimed &&
    claimed !== "application/octet-stream" &&
    !spec.claimedTypes.has(claimed)
  ) {
    throw new MailDocumentError("MAIL_FILE_INVALID");
  }
  if (!hasSignature(input.bytes, spec.signature)) {
    throw new MailDocumentError("MAIL_FILE_INVALID");
  }

  return {
    bytes: input.bytes,
    contentType: spec.contentType,
    extension,
    byteSize: input.bytes.length,
    width: 0,
    height: 0,
    sha256: createHash("sha256").update(input.bytes).digest("hex")
  };
}
