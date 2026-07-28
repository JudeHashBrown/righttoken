import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import {
  createLocalMailAssetStorage
} from "@/modules/mail/assets/local-storage";
import {
  createS3MailAssetStorage
} from "@/modules/mail/assets/s3-storage";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("local mail asset storage", () => {
  it("writes, reads, checks, and deletes a private asset", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "righttoken-mail-assets-")
    );
    temporaryDirectories.push(root);
    const storage = createLocalMailAssetStorage(root);
    const bytes = Buffer.from("private-image-bytes");

    await storage.put("2026/asset.webp", bytes, "image/webp");

    await expect(storage.exists("2026/asset.webp")).resolves.toBe(true);
    await expect(storage.get("2026/asset.webp")).resolves.toEqual(bytes);
    await storage.delete("2026/asset.webp");
    await expect(storage.exists("2026/asset.webp")).resolves.toBe(false);
  });

  it("rejects path traversal", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "righttoken-mail-assets-")
    );
    temporaryDirectories.push(root);
    const storage = createLocalMailAssetStorage(root);

    await expect(
      storage.put("../escape.webp", Buffer.from("x"), "image/webp")
    ).rejects.toThrow("MAIL_ASSET_INVALID_KEY");
  });
});

describe("S3 mail asset storage", () => {
  it("uses private object commands for the storage contract", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(Uint8Array.from([1, 2, 3]))
        }
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const storage = createS3MailAssetStorage({
      bucket: "private-mail",
      client: { send }
    });

    await storage.put(
      "mail-assets/test.webp",
      Buffer.from([1, 2, 3]),
      "image/webp"
    );
    await expect(
      storage.get("mail-assets/test.webp")
    ).resolves.toEqual(Buffer.from([1, 2, 3]));
    await expect(
      storage.exists("mail-assets/test.webp")
    ).resolves.toBe(true);
    await storage.delete("mail-assets/test.webp");

    expect(
      send.mock.calls.map(([command]) => command.constructor.name)
    ).toEqual([
      "PutObjectCommand",
      "GetObjectCommand",
      "HeadObjectCommand",
      "DeleteObjectCommand"
    ]);
  });
});
