import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword
} from "@/modules/auth/password";

describe("password service", () => {
  it("hashes with Argon2id and verifies only the matching password", async () => {
    const hash = await hashPassword("a-secure-development-password");

    expect(hash).not.toContain("a-secure-development-password");
    await expect(
      verifyPassword(hash, "a-secure-development-password")
    ).resolves.toBe(true);
    await expect(
      verifyPassword(hash, "a-different-development-password")
    ).resolves.toBe(false);
  });

  it("treats a malformed stored hash as a failed login", async () => {
    await expect(
      verifyPassword("not-an-argon2-hash", "any-password")
    ).resolves.toBe(false);
  });
});
