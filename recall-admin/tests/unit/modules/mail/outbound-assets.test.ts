import { describe, expect, it, vi } from "vitest";
import {
  resolveOutboundMailAssets
} from "@/modules/mail/outbound-assets";

describe("resolveOutboundMailAssets", () => {
  it("loads private bytes and converts controlled image markers to CID", async () => {
    const rows = [
      {
        id: "inline-1",
        storageKey: "mail-assets/inline.webp",
        fileName: "guide.webp",
        contentType: "image/webp",
        byteSize: 100
      },
      {
        id: "attachment-1",
        storageKey: "mail-assets/receipt.png",
        fileName: "receipt.png",
        contentType: "image/png",
        byteSize: 200
      }
    ];
    const storage = {
      put: vi.fn(),
      get: vi.fn((key: string) =>
        Promise.resolve(Buffer.from(key))
      ),
      delete: vi.fn(),
      exists: vi.fn()
    };
    const database = {
      mailAsset: {
        findMany: vi.fn().mockResolvedValue(rows)
      }
    };

    const resolved = await resolveOutboundMailAssets(
      {
        bodyHtml:
          '<p>说明</p><img data-mail-asset-id="inline-1" alt="指南">',
        assets: [
          {
            id: "inline-1",
            disposition: "INLINE",
            sortOrder: 0
          },
          {
            id: "attachment-1",
            disposition: "ATTACHMENT",
            sortOrder: 1
          }
        ]
      },
      { database, storage }
    );

    expect(resolved.html).toContain(
      'src="cid:inline-1@righttoken"'
    );
    expect(resolved.attachments).toEqual([
      expect.objectContaining({
        filename: "guide.webp",
        cid: "inline-1@righttoken",
        contentDisposition: "inline"
      }),
      expect.objectContaining({
        filename: "receipt.png",
        contentDisposition: "attachment"
      })
    ]);
    expect(resolved.messageAssets).toEqual([
      expect.objectContaining({
        assetId: "inline-1",
        disposition: "INLINE"
      }),
      expect.objectContaining({
        assetId: "attachment-1",
        disposition: "ATTACHMENT"
      })
    ]);
  });

  it("fails before SMTP when one asset is missing", async () => {
    await expect(
      resolveOutboundMailAssets(
        {
          bodyHtml: "<p>说明</p>",
          assets: [
            {
              id: "missing",
              disposition: "ATTACHMENT",
              sortOrder: 0
            }
          ]
        },
        {
          database: {
            mailAsset: {
              findMany: vi.fn().mockResolvedValue([])
            }
          },
          storage: {
            put: vi.fn(),
            get: vi.fn(),
            delete: vi.fn(),
            exists: vi.fn()
          }
        }
      )
    ).rejects.toMatchObject({
      code: "MAIL_ASSET_MISSING"
    });
  });
});
