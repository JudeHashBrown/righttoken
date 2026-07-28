import { describe, expect, it } from "vitest";
import {
  createRecoveryCodes,
  createTwoFactorMaterial,
  verifyTotp
} from "@/modules/auth/two-factor";

describe("two-factor authentication", () => {
  it("accepts a current TOTP and rejects an incorrect code", async () => {
    const setup = await createTwoFactorMaterial(
      "admin@example.test"
    );
    const code = await setup.totp.generate();
    const incorrectCode = (
      (Number(code) + 1) %
      1_000_000
    )
      .toString()
      .padStart(6, "0");

    await expect(verifyTotp(setup.secret, code)).resolves.toBe(true);
    await expect(
      verifyTotp(setup.secret, incorrectCode)
    ).resolves.toBe(false);
  });

  it("returns recovery codes but stores only Argon2 hashes", async () => {
    const result = await createRecoveryCodes();

    expect(result.plaintext).toHaveLength(10);
    expect(result.hashes).toHaveLength(10);
    expect(result.hashes.join(" ")).not.toContain(
      result.plaintext[0]
    );
    expect(new Set(result.plaintext).size).toBe(10);
  });
});
