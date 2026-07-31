import { describe, expect, it, vi } from "vitest";
import {
  createMailAsset,
  readMailAsset
} from "@/modules/mail/assets/asset-service";
import * as storageFactory from "@/modules/mail/assets/storage-factory";

describe("mail asset service", () => {
  it("translates storage initialization failures", async () => {
    vi.spyOn(storageFactory, "getMailAssetStorage").mockImplementation(
      () => {
        throw new Error("MAIL_ASSET_LOCAL_STORAGE_FORBIDDEN");
      }
    );

    await expect(
      createMailAsset({
        actorId: "operator-1",
        file: new File([Buffer.from("source")], "guide.png", {
          type: "image/png"
        })
      })
    ).rejects.toMatchObject({
      code: "MAIL_ASSET_STORAGE_UNAVAILABLE"
    });

    vi.restoreAllMocks();
  });

  it("writes normalized bytes before recording private metadata", async () => {
    const storage = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn()
    };
    const database = {
      mailAsset: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "asset-1", ...data })
        ),
        findFirst: vi.fn()
      }
    };
    const normalized = {
      bytes: Buffer.from("normalized"),
      contentType: "image/webp" as const,
      extension: "webp" as const,
      byteSize: 10,
      width: 320,
      height: 180,
      sha256: "a".repeat(64)
    };

    const asset = await createMailAsset(
      {
        actorId: "operator-1",
        file: new File([Buffer.from("source")], "guide.png", {
          type: "image/png"
        })
      },
      {
        database,
        storage,
        normalize: vi.fn().mockResolvedValue(normalized),
        randomId: () => "stable-id"
      }
    );

    expect(storage.put).toHaveBeenCalledWith(
      "mail-assets/stable-id.webp",
      normalized.bytes,
      "image/webp"
    );
    expect(database.mailAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey: "mail-assets/stable-id.webp",
        fileName: "guide.webp",
        createdById: "operator-1"
      })
    });
    expect(asset.id).toBe("asset-1");
  });

  it("translates object storage write failures", async () => {
    const storage = {
      put: vi.fn().mockRejectedValue(new Error("S3 unavailable")),
      get: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn()
    };
    const database = {
      mailAsset: {
        create: vi.fn(),
        findFirst: vi.fn()
      }
    };

    await expect(
      createMailAsset(
        {
          actorId: "operator-1",
          file: new File([Buffer.from("source")], "guide.png", {
            type: "image/png"
          })
        },
        {
          database,
          storage,
          normalize: vi.fn().mockResolvedValue({
            bytes: Buffer.from("normalized"),
            contentType: "image/png",
            extension: "png",
            byteSize: 10,
            width: 100,
            height: 100,
            sha256: "c".repeat(64)
          }),
          randomId: () => "unavailable-id"
        }
      )
    ).rejects.toMatchObject({
      code: "MAIL_ASSET_STORAGE_UNAVAILABLE"
    });
    expect(database.mailAsset.create).not.toHaveBeenCalled();
  });

  it("removes stored bytes when metadata persistence fails", async () => {
    const storage = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn()
    };
    const database = {
      mailAsset: {
        create: vi.fn().mockRejectedValue(new Error("database down")),
        findFirst: vi.fn()
      }
    };

    await expect(
      createMailAsset(
        {
          actorId: "operator-1",
          file: new File([Buffer.from("source")], "guide.png", {
            type: "image/png"
          })
        },
        {
          database,
          storage,
          normalize: vi.fn().mockResolvedValue({
            bytes: Buffer.from("normalized"),
            contentType: "image/png",
            extension: "png",
            byteSize: 10,
            width: 100,
            height: 100,
            sha256: "b".repeat(64)
          }),
          randomId: () => "failed-id"
        }
      )
    ).rejects.toThrow("database down");
    expect(storage.delete).toHaveBeenCalledWith(
      "mail-assets/failed-id.png"
    );
  });

  it("reads only an asset visible in the actor's mail scope", async () => {
    const bytes = Buffer.from("private");
    const storage = {
      put: vi.fn(),
      get: vi.fn().mockResolvedValue(bytes),
      delete: vi.fn(),
      exists: vi.fn()
    };
    const asset = {
      id: "asset-1",
      storageKey: "mail-assets/asset-1.webp",
      fileName: "guide.webp",
      contentType: "image/webp",
      byteSize: bytes.length
    };
    const database = {
      mailAsset: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(asset)
      }
    };

    await expect(
      readMailAsset(
        {
          actor: { id: "operator-1", role: "OPERATOR" },
          assetId: "asset-1"
        },
        { database, storage }
      )
    ).resolves.toEqual({ asset, bytes });
    expect(database.mailAsset.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "asset-1",
        OR: expect.any(Array)
      }),
      select: expect.any(Object)
    });
  });

  it("fails closed when the actor cannot see the asset", async () => {
    const database = {
      mailAsset: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };

    await expect(
      readMailAsset(
        {
          actor: { id: "operator-1", role: "OPERATOR" },
          assetId: "hidden"
        },
        {
          database,
          storage: {
            put: vi.fn(),
            get: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn()
          }
        }
      )
    ).rejects.toMatchObject({
      code: "MAIL_ASSET_NOT_FOUND"
    });
  });
});
