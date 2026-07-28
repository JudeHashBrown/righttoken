import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  normalizeMailImage
} from "@/modules/mail/assets/image-normalizer";

async function image(
  format: "jpeg" | "png" | "webp"
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width: 16,
      height: 12,
      channels: 4,
      background: { r: 64, g: 98, b: 210, alpha: 1 }
    }
  });
  return format === "jpeg"
    ? pipeline.jpeg().toBuffer()
    : format === "png"
      ? pipeline.png().toBuffer()
      : pipeline.webp().toBuffer();
}

describe("normalizeMailImage", () => {
  it.each([
    ["jpeg", "image/jpeg", "jpg"],
    ["png", "image/png", "png"],
    ["webp", "image/webp", "webp"]
  ] as const)(
    "normalizes %s and returns trusted metadata",
    async (format, contentType, extension) => {
      const normalized = await normalizeMailImage({
        bytes: await image(format),
        claimedContentType: "application/octet-stream"
      });

      expect(normalized).toMatchObject({
        contentType,
        extension,
        width: 16,
        height: 12
      });
      expect(normalized.byteSize).toBe(normalized.bytes.length);
      expect(normalized.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  );

  it.each([
    ["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ["GIF", Buffer.from("GIF89a", "ascii")]
  ])("rejects %s images", async (_label, bytes) => {
    await expect(
      normalizeMailImage({
        bytes,
        claimedContentType: "image/png"
      })
    ).rejects.toMatchObject({
      code: "MAIL_IMAGE_UNSUPPORTED"
    });
  });

  it("rejects an image larger than 5 MB before decoding", async () => {
    await expect(
      normalizeMailImage({
        bytes: Buffer.alloc(5 * 1024 * 1024 + 1),
        claimedContentType: "image/png"
      })
    ).rejects.toMatchObject({
      code: "MAIL_IMAGE_TOO_LARGE"
    });
  });

  it("trusts detected bytes instead of the browser MIME value", async () => {
    await expect(
      normalizeMailImage({
        bytes: await image("jpeg"),
        claimedContentType: "image/png"
      })
    ).resolves.toMatchObject({
      contentType: "image/jpeg",
      extension: "jpg"
    });
  });
});
