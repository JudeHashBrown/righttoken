import { prisma } from "@/lib/db/prisma";
import {
  getMailAssetStorage
} from "@/modules/mail/assets/storage-factory";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";
import {
  mailAssetIdsInHtml
} from "@/modules/mail/rich-content";
import {
  processMailHtml
} from "@/modules/mail/html-policy";

export type OutboundAssetReference = {
  id: string;
  disposition: "INLINE" | "ATTACHMENT";
  sortOrder: number;
};

type AssetRow = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
};

type AssetDatabase = {
  mailAsset: {
    findMany(input: {
      where: { id: { in: string[] } };
      select: {
        id: true;
        storageKey: true;
        fileName: true;
        contentType: true;
        byteSize: true;
      };
    }): Promise<AssetRow[]>;
  };
};

export class OutboundMailAssetError extends Error {
  constructor(
    readonly code:
      | "MAIL_ASSET_MISSING"
      | "MAIL_ASSET_LIMIT_EXCEEDED"
      | "MAIL_ASSET_TOTAL_TOO_LARGE"
      | "MAIL_INLINE_ASSET_MISMATCH"
  ) {
    super(code);
    this.name = "OutboundMailAssetError";
  }
}

export async function resolveOutboundMailAssets(
  input: {
    bodyHtml: string;
    assets: OutboundAssetReference[];
  },
  dependencies: {
    database?: AssetDatabase;
    storage?: MailAssetStorage;
  } = {}
) {
  if (input.assets.length > 10) {
    throw new OutboundMailAssetError(
      "MAIL_ASSET_LIMIT_EXCEEDED"
    );
  }
  const processed = processMailHtml(input.bodyHtml);
  const safeHtml = processed.html;
  const inlineIds = new Set(
    input.assets
      .filter((asset) => asset.disposition === "INLINE")
      .map((asset) => asset.id)
  );
  const htmlIds = new Set(mailAssetIdsInHtml(safeHtml));
  if (
    inlineIds.size !== htmlIds.size ||
    [...inlineIds].some((id) => !htmlIds.has(id))
  ) {
    throw new OutboundMailAssetError(
      "MAIL_INLINE_ASSET_MISMATCH"
    );
  }
  if (input.assets.length === 0) {
    return {
      bodyHtml: safeHtml,
      bodyText: processed.text,
      html: safeHtml,
      attachments: [],
      messageAssets: []
    };
  }

  const database = dependencies.database ?? prisma;
  const storage = dependencies.storage ?? getMailAssetStorage();
  const rows = await database.mailAsset.findMany({
    where: {
      id: { in: input.assets.map((asset) => asset.id) }
    },
    select: {
      id: true,
      storageKey: true,
      fileName: true,
      contentType: true,
      byteSize: true
    }
  });
  if (rows.length !== new Set(input.assets.map((asset) => asset.id)).size) {
    throw new OutboundMailAssetError("MAIL_ASSET_MISSING");
  }
  if (
    rows.reduce((sum, asset) => sum + asset.byteSize, 0) >
    20 * 1024 * 1024
  ) {
    throw new OutboundMailAssetError(
      "MAIL_ASSET_TOTAL_TOO_LARGE"
    );
  }

  const rowById = new Map(rows.map((row) => [row.id, row]));
  const ordered = [...input.assets].sort(
    (left, right) => left.sortOrder - right.sortOrder
  );
  const resolved = await Promise.all(
    ordered.map(async (reference) => {
      const row = rowById.get(reference.id);
      if (!row) {
        throw new OutboundMailAssetError("MAIL_ASSET_MISSING");
      }
      let content: Buffer;
      try {
        content = await storage.get(row.storageKey);
      } catch {
        throw new OutboundMailAssetError("MAIL_ASSET_MISSING");
      }
      const cid =
        reference.disposition === "INLINE"
          ? `${row.id}@righttoken`
          : null;
      return {
        row,
        reference,
        cid,
        attachment: {
          filename: row.fileName,
          content,
          contentType: row.contentType,
          ...(cid ? { cid } : {}),
          contentDisposition:
            reference.disposition === "INLINE"
              ? ("inline" as const)
              : ("attachment" as const)
        }
      };
    })
  );
  let deliveryHtml = safeHtml;
  for (const item of resolved) {
    if (!item.cid) continue;
    deliveryHtml = deliveryHtml.replaceAll(
      `data-mail-asset-id="${item.row.id}"`,
      `src="cid:${item.cid}" data-mail-asset-id="${item.row.id}"`
    );
  }

  return {
    bodyHtml: safeHtml,
    bodyText: processed.text,
    html: deliveryHtml,
    attachments: resolved.map((item) => item.attachment),
    messageAssets: resolved.map((item) => ({
      assetId: item.row.id,
      disposition: item.reference.disposition,
      cid: item.cid,
      sortOrder: item.reference.sortOrder
    }))
  };
}
