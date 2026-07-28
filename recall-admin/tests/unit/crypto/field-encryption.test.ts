import { describe, expect, it } from "vitest";
import { createFieldCipher } from "@/lib/crypto/field-encryption";

describe("field encryption", () => {
  it("round-trips without exposing plaintext", () => {
    const cipher = createFieldCipher(Buffer.alloc(32, 7));
    const encrypted = cipher.encrypt("203.0.113.42");

    expect(encrypted).not.toContain("203.0.113.42");
    expect(cipher.decrypt(encrypted)).toBe("203.0.113.42");
  });

  it("rejects tampered ciphertext", () => {
    const cipher = createFieldCipher(Buffer.alloc(32, 7));
    const encrypted = cipher.encrypt("secret");
    const replacement = encrypted.endsWith("A") ? "B" : "A";
    const tampered = `${encrypted.slice(0, -1)}${replacement}`;

    expect(() => cipher.decrypt(tampered)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => createFieldCipher(Buffer.alloc(16))).toThrow(
      "encryption key must be 32 bytes"
    );
  });
});
