import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";

type CommandClient = {
  send(command: object): Promise<unknown>;
};

function notFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    record.name === "NotFound" ||
    record.name === "NoSuchKey" ||
    record.$metadata?.httpStatusCode === 404
  );
}

export function createS3MailAssetStorage(input: {
  bucket: string;
  client: CommandClient;
}): MailAssetStorage {
  return {
    async put(key, bytes, contentType) {
      await input.client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType
        })
      );
    },
    async get(key) {
      const response = (await input.client.send(
        new GetObjectCommand({
          Bucket: input.bucket,
          Key: key
        })
      )) as {
        Body?: {
          transformToByteArray(): Promise<Uint8Array>;
        };
      };
      if (!response.Body) {
        throw new Error("MAIL_ASSET_MISSING");
      }
      return Buffer.from(await response.Body.transformToByteArray());
    },
    async delete(key) {
      await input.client.send(
        new DeleteObjectCommand({
          Bucket: input.bucket,
          Key: key
        })
      );
    },
    async exists(key) {
      try {
        await input.client.send(
          new HeadObjectCommand({
            Bucket: input.bucket,
            Key: key
          })
        );
        return true;
      } catch (error) {
        if (notFound(error)) return false;
        throw error;
      }
    }
  };
}
