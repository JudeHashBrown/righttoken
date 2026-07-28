import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import type {
  MailAssetStorage
} from "@/modules/mail/assets/types";

function resolvePrivateKey(root: string, key: string): string {
  const normalized = key.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..")
  ) {
    throw new Error("MAIL_ASSET_INVALID_KEY");
  }
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, normalized);
  if (
    target !== absoluteRoot &&
    !target.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    throw new Error("MAIL_ASSET_INVALID_KEY");
  }
  return target;
}

export function createLocalMailAssetStorage(
  root: string
): MailAssetStorage {
  return {
    async put(key, bytes) {
      const target = resolvePrivateKey(root, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    },
    get(key) {
      return readFile(resolvePrivateKey(root, key));
    },
    async delete(key) {
      await rm(resolvePrivateKey(root, key), { force: true });
    },
    async exists(key) {
      try {
        return (
          await stat(resolvePrivateKey(root, key))
        ).isFile();
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return false;
        }
        throw error;
      }
    }
  };
}
