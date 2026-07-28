import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import {
  MailImageError,
  normalizeMailImage
} from "@/modules/mail/assets/image-normalizer";
import {
  getMailAssetStorage
} from "@/modules/mail/assets/storage-factory";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";
import {
  plainTextToMailHtml,
  sanitizeMailHtml
} from "@/modules/mail/rich-content";
import type {
  MailboxMessage
} from "@/modules/mail/types";

const MAX_IMAGE_COUNT = 10;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

type PreparedAsset = {
  assetId: string;
  storageKey: string;
  disposition: "INLINE" | "ATTACHMENT";
  cid: string | null;
  sortOrder: number;
};

export type PreparedInboundMessage = {
  bodyHtml: string;
  externalImagesBlocked: boolean;
  assets: PreparedAsset[];
};

function safeFileName(
  original: string,
  extension: string
): string {
  const parsed = path.parse(
    original.replaceAll(/[\u0000-\u001f\u007f]/g, "").trim()
  );
  return `${parsed.name.trim().slice(0, 180) || "image"}.${extension}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceCidSource(
  html: string,
  cid: string,
  assetId: string
): string {
  return html.replace(
    new RegExp(
      `(src\\s*=\\s*["'])cid:${escapeRegExp(cid)}(["'])`,
      "gi"
    ),
    `data-mail-asset-id="${assetId}"`
  );
}

export async function prepareInboundMailAssets(
  message: Pick<
    MailboxMessage,
    "bodyHtml" | "bodyText" | "attachments"
  >,
  dependencies: {
    storage?: MailAssetStorage;
  } = {}
): Promise<PreparedInboundMessage> {
  const storage = dependencies.storage ?? getMailAssetStorage();
  const candidates = (message.attachments ?? []).slice(
    0,
    MAX_IMAGE_COUNT
  );
  let totalBytes = 0;
  let html =
    message.bodyHtml?.trim() ||
    plainTextToMailHtml(message.bodyText);
  const externalImagesBlocked =
    /<img\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(html);
  const prepared: PreparedAsset[] = [];

  try {
    for (const [index, attachment] of candidates.entries()) {
      if (
        totalBytes + attachment.content.length >
        MAX_TOTAL_BYTES
      ) {
        break;
      }
      try {
      const normalized = await normalizeMailImage({
        bytes: attachment.content,
        claimedContentType: attachment.contentType
      });
      totalBytes += normalized.byteSize;
      const storageKey = `mail-assets/${randomUUID()}.${
        normalized.extension
      }`;
      await storage.put(
        storageKey,
        normalized.bytes,
        normalized.contentType
      );
      let asset: { id: string };
      try {
        asset = await prisma.mailAsset.create({
          data: {
            storageKey,
            fileName: safeFileName(
              attachment.fileName,
              normalized.extension
            ),
            contentType: normalized.contentType,
            byteSize: normalized.byteSize,
            sha256: normalized.sha256,
            width: normalized.width,
            height: normalized.height,
            createdById: null
          },
          select: { id: true }
        });
      } catch (error) {
        await storage.delete(storageKey).catch(() => undefined);
        throw error;
      }
      const cid = attachment.cid?.replace(/^<|>$/g, "") || null;
      const embedded =
        attachment.disposition === "INLINE" &&
        cid &&
        new RegExp(
          `src\\s*=\\s*["']cid:${escapeRegExp(cid)}["']`,
          "i"
        ).test(html);
      const disposition = embedded ? "INLINE" : "ATTACHMENT";
      if (embedded) {
        html = replaceCidSource(html, cid, asset.id);
      }
      prepared.push({
        assetId: asset.id,
        storageKey,
        disposition,
        cid: embedded ? cid : null,
        sortOrder: index
      });
      } catch (error) {
        if (error instanceof MailImageError) {
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    await discardPreparedInboundAssets(
      [
        {
          bodyHtml: "",
          externalImagesBlocked: false,
          assets: prepared
        }
      ],
      storage
    );
    throw error;
  }

  return {
    bodyHtml: sanitizeMailHtml(html),
    externalImagesBlocked,
    assets: prepared
  };
}

export async function discardPreparedInboundAssets(
  prepared: PreparedInboundMessage[],
  storage: MailAssetStorage = getMailAssetStorage()
): Promise<void> {
  const assets = prepared.flatMap((message) => message.assets);
  await prisma.mailAsset.deleteMany({
    where: { id: { in: assets.map((asset) => asset.assetId) } }
  });
  await Promise.all(
    assets.map((asset) =>
      storage.delete(asset.storageKey).catch(() => undefined)
    )
  );
}
