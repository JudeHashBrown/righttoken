import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  MemberRole
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  MailImageError,
  normalizeMailImage,
  type NormalizedMailImage
} from "@/modules/mail/assets/image-normalizer";
import {
  MailDocumentError,
  normalizeMailDocument,
  type NormalizedMailDocument
} from "@/modules/mail/assets/document-normalizer";
import {
  getMailAssetStorage
} from "@/modules/mail/assets/storage-factory";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";

export type MailAssetServiceErrorCode =
  | "MAIL_IMAGE_UNSUPPORTED"
  | "MAIL_IMAGE_TOO_LARGE"
  | "MAIL_IMAGE_INVALID"
  | "MAIL_FILE_UNSUPPORTED"
  | "MAIL_FILE_TOO_LARGE"
  | "MAIL_FILE_INVALID"
  | "MAIL_ASSET_INVALID_FILE"
  | "MAIL_ASSET_STORAGE_UNAVAILABLE"
  | "MAIL_ASSET_NOT_FOUND"
  | "MAIL_ASSET_MISSING";

export class MailAssetServiceError extends Error {
  constructor(readonly code: MailAssetServiceErrorCode) {
    super(code);
    this.name = "MailAssetServiceError";
  }
}

type AssetRecord = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  width?: number;
  height?: number;
  sha256?: string;
  createdById?: string | null;
};

type AssetDatabase = {
  mailAsset: {
    create(input: {
      data: {
        storageKey: string;
        fileName: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        width: number;
        height: number;
        createdById: string;
      };
    }): Promise<AssetRecord>;
    findFirst(input: {
      where: object;
      select: {
        id: true;
        storageKey: true;
        fileName: true;
        contentType: true;
        byteSize: true;
      };
    }): Promise<AssetRecord | null>;
  };
};

type CreateDependencies = {
  database: AssetDatabase;
  storage: MailAssetStorage;
  normalize(input: {
    bytes: Buffer;
    claimedContentType?: string;
    fileName: string;
  }): Promise<NormalizedMailImage | NormalizedMailDocument>;
  randomId(): string;
};

type ReadDependencies = Pick<
  CreateDependencies,
  "database" | "storage"
>;

function displayFileName(
  original: string,
  extension: string
): string {
  const parsed = path.parse(
    original.replaceAll(/[\u0000-\u001f\u007f]/g, "").trim()
  );
  const base = parsed.name.trim().slice(0, 180) || "file";
  return `${base}.${extension}`;
}

const imageExtensionPattern = /\.(?:jpe?g|png|webp)$/i;

async function normalizeMailAsset(input: {
  bytes: Buffer;
  claimedContentType?: string;
  fileName: string;
}): Promise<NormalizedMailImage | NormalizedMailDocument> {
  if (imageExtensionPattern.test(input.fileName)) {
    return normalizeMailImage(input);
  }
  return normalizeMailDocument(input);
}

export async function createMailAsset(
  input: {
    actorId: string;
    file: File;
  },
  dependencies?: CreateDependencies
): Promise<AssetRecord> {
  let runtime: CreateDependencies;
  try {
    runtime = dependencies ?? {
      database: prisma,
      storage: getMailAssetStorage(),
      normalize: normalizeMailAsset,
      randomId: randomUUID
    };
  } catch {
    throw new MailAssetServiceError(
      "MAIL_ASSET_STORAGE_UNAVAILABLE"
    );
  }
  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new MailAssetServiceError("MAIL_ASSET_INVALID_FILE");
  }
  let normalized: NormalizedMailImage | NormalizedMailDocument;
  try {
    normalized = await runtime.normalize({
      bytes: Buffer.from(await input.file.arrayBuffer()),
      claimedContentType: input.file.type,
      fileName: input.file.name
    });
  } catch (error) {
    if (
      error instanceof MailImageError ||
      error instanceof MailDocumentError
    ) {
      throw new MailAssetServiceError(error.code);
    }
    throw error;
  }
  const storageKey = `mail-assets/${runtime.randomId()}.${
    normalized.extension
  }`;
  try {
    await runtime.storage.put(
      storageKey,
      normalized.bytes,
      normalized.contentType
    );
  } catch {
    throw new MailAssetServiceError(
      "MAIL_ASSET_STORAGE_UNAVAILABLE"
    );
  }
  try {
    return await runtime.database.mailAsset.create({
      data: {
        storageKey,
        fileName: displayFileName(
          input.file.name,
          normalized.extension
        ),
        contentType: normalized.contentType,
        byteSize: normalized.byteSize,
        sha256: normalized.sha256,
        width: normalized.width,
        height: normalized.height,
        createdById: input.actorId
      }
    });
  } catch (error) {
    await runtime.storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

function visibilityScope(actor: {
  id: string;
  role: MemberRole;
}): object {
  if (actor.role !== "OPERATOR") return {};
  return {
    OR: [
      { createdById: actor.id },
      { templateUsages: { some: {} } },
      {
        messageUsages: {
          some: {
            message: {
              OR: [
                { user: { ownerId: actor.id } },
                { user: { ownerId: null } },
                { task: { assigneeId: actor.id } },
                { task: { assigneeId: null } },
                { userId: null, taskId: null }
              ]
            }
          }
        }
      },
      {
        rechargeOutreachRecords: {
          some: {
            user: {
              OR: [
                { ownerId: actor.id },
                { ownerId: null },
                { tasks: { some: { assigneeId: actor.id } } },
                { tasks: { some: { assigneeId: null, status: "UNASSIGNED" } } }
              ]
            }
          }
        }
      }
    ]
  };
}

export async function readMailAsset(
  input: {
    actor: { id: string; role: MemberRole };
    assetId: string;
  },
  dependencies: ReadDependencies = {
    database: prisma,
    storage: getMailAssetStorage()
  }
): Promise<{ asset: AssetRecord; bytes: Buffer }> {
  const asset = await dependencies.database.mailAsset.findFirst({
    where: {
      id: input.assetId,
      ...visibilityScope(input.actor)
    },
    select: {
      id: true,
      storageKey: true,
      fileName: true,
      contentType: true,
      byteSize: true
    }
  });
  if (!asset) {
    throw new MailAssetServiceError("MAIL_ASSET_NOT_FOUND");
  }
  try {
    return {
      asset,
      bytes: await dependencies.storage.get(asset.storageKey)
    };
  } catch {
    throw new MailAssetServiceError("MAIL_ASSET_MISSING");
  }
}
