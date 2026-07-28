import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import {
  createLocalMailAssetStorage
} from "@/modules/mail/assets/local-storage";
import {
  createS3MailAssetStorage
} from "@/modules/mail/assets/s3-storage";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";

let storage: MailAssetStorage | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`MAIL_ASSET_CONFIG_MISSING:${name}`);
  }
  return value;
}

export function getMailAssetStorage(): MailAssetStorage {
  if (storage) return storage;
  const kind = process.env.MAIL_ASSET_STORAGE?.trim() || "local";
  if (kind === "local") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MAIL_ASSET_LOCAL_STORAGE_FORBIDDEN");
    }
    storage = createLocalMailAssetStorage(
      process.env.MAIL_ASSET_LOCAL_DIR?.trim() ||
        path.join(process.cwd(), ".data", "mail-assets")
    );
    return storage;
  }
  if (kind !== "s3") {
    throw new Error("MAIL_ASSET_STORAGE_UNSUPPORTED");
  }
  const bucket = required("MAIL_ASSET_S3_BUCKET");
  storage = createS3MailAssetStorage({
    bucket,
    client: new S3Client({
      endpoint: process.env.MAIL_ASSET_S3_ENDPOINT?.trim() || undefined,
      region: required("MAIL_ASSET_S3_REGION"),
      forcePathStyle:
        process.env.MAIL_ASSET_S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: required("MAIL_ASSET_S3_ACCESS_KEY_ID"),
        secretAccessKey: required(
          "MAIL_ASSET_S3_SECRET_ACCESS_KEY"
        )
      }
    })
  });
  return storage;
}

export function resetMailAssetStorageForTests(): void {
  storage = null;
}
