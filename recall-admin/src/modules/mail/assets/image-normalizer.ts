import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_MAIL_IMAGE_BYTES = 5 * 1024 * 1024;

export type MailImageErrorCode =
  | "MAIL_IMAGE_UNSUPPORTED"
  | "MAIL_IMAGE_TOO_LARGE"
  | "MAIL_IMAGE_INVALID";

export class MailImageError extends Error {
  constructor(readonly code: MailImageErrorCode) {
    super(code);
    this.name = "MailImageError";
  }
}

export type NormalizedMailImage = {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
};

export async function normalizeMailImage(input: {
  bytes: Buffer;
  claimedContentType?: string;
}): Promise<NormalizedMailImage> {
  if (input.bytes.length > MAX_MAIL_IMAGE_BYTES) {
    throw new MailImageError("MAIL_IMAGE_TOO_LARGE");
  }
  void input.claimedContentType;

  let metadata: Awaited<
    ReturnType<ReturnType<typeof sharp>["metadata"]>
  >;
  try {
    metadata = await sharp(input.bytes, {
      failOn: "warning",
      limitInputPixels: 40_000_000
    }).metadata();
  } catch {
    throw new MailImageError("MAIL_IMAGE_UNSUPPORTED");
  }
  if (
    !metadata.width ||
    !metadata.height ||
    !["jpeg", "png", "webp"].includes(metadata.format ?? "")
  ) {
    throw new MailImageError("MAIL_IMAGE_UNSUPPORTED");
  }

  const source = sharp(input.bytes, {
    failOn: "warning",
    limitInputPixels: 40_000_000
  }).rotate();
  let bytes: Buffer;
  let contentType: NormalizedMailImage["contentType"];
  let extension: NormalizedMailImage["extension"];
  if (metadata.format === "jpeg") {
    bytes = await source.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    contentType = "image/jpeg";
    extension = "jpg";
  } else if (metadata.format === "png") {
    bytes = await source.png({ compressionLevel: 9 }).toBuffer();
    contentType = "image/png";
    extension = "png";
  } else {
    bytes = await source.webp({ quality: 88 }).toBuffer();
    contentType = "image/webp";
    extension = "webp";
  }
  if (bytes.length > MAX_MAIL_IMAGE_BYTES) {
    throw new MailImageError("MAIL_IMAGE_TOO_LARGE");
  }
  const normalizedMetadata = await sharp(bytes).metadata();
  if (!normalizedMetadata.width || !normalizedMetadata.height) {
    throw new MailImageError("MAIL_IMAGE_INVALID");
  }

  return {
    bytes,
    contentType,
    extension,
    byteSize: bytes.length,
    width: normalizedMetadata.width,
    height: normalizedMetadata.height,
    sha256: createHash("sha256").update(bytes).digest("hex")
  };
}
