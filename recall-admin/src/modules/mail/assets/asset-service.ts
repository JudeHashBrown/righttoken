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
  getMailAssetStorage
} from "@/modules/mail/assets/storage-factory";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";

export type MailAssetServiceErrorCode =
  | "MAIL_IMAGE_UNSUPPORTED"
  | "MAIL_IMAGE_TOO_LARGE"
  | "MAIL_IMAGE_INVALID"
  | "MAIL_ASSET_INVALID_FILE"
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
  }): Promise<NormalizedMailImage>;
  randomId(): string;
};

type ReadDependencies = Pick<
  CreateDependencies,
  "database" | "storage"
>;

const defaultCreateDependencies: CreateDependencies = {
  database: prisma,
  storage: getMailAssetStorage(),
  normalize: normalizeMailImage,
  randomId: randomUUID
};

function displayFileName(
  original: string,
  extension: string
): string {
  const parsed = path.parse(
    original.replaceAll(/[\u0000-\u001f\u007f]/g, "").trim()
  );
  const base = parsed.name.trim().slice(0, 180) || "image";
  return `${base}.${extension}`;
}

export async function createMailAsset(
  input: {
    actorId: string;
    file: File;
  },
  dependencies: CreateDependencies = defaultCreateDependencies
): Promise<AssetRecord> {
  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new MailAssetServiceError("MAIL_ASSET_INVALID_FILE");
  }
  let normalized: NormalizedMailImage;
  try {
    normalized = await dependencies.normalize({
      bytes: Buffer.from(await input.file.arrayBuffer()),
      claimedContentType: input.file.type
    });
  } catch (error) {
    if (error instanceof MailImageError) {
      throw new MailAssetServiceError(error.code);
    }
    throw error;
  }
  const storageKey = `mail-assets/${dependencies.randomId()}.${
    normalized.extension
  }`;
  await dependencies.storage.put(
    storageKey,
    normalized.bytes,
    normalized.contentType
  );
  try {
    return await dependencies.database.mailAsset.create({
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
    await dependencies.storage.delete(storageKey).catch(() => undefined);
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
