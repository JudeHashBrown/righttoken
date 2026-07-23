import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

export function createFieldCipher(key: Buffer) {
  if (key.length !== 32) {
    throw new Error("encryption key must be 32 bytes");
  }

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final()
      ]);
      const tag = cipher.getAuthTag();

      return [
        VERSION,
        iv.toString("base64url"),
        tag.toString("base64url"),
        body.toString("base64url")
      ].join(".");
    },

    decrypt(value: string): string {
      const [version, iv, tag, body, extra] = value.split(".");
      if (
        version !== VERSION ||
        !iv ||
        !tag ||
        !body ||
        extra !== undefined
      ) {
        throw new Error("invalid ciphertext");
      }

      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(iv, "base64url")
      );
      decipher.setAuthTag(Buffer.from(tag, "base64url"));

      return Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final()
      ]).toString("utf8");
    }
  };
}
