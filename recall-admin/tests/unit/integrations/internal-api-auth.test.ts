import { describe, expect, it } from "vitest";
import { isValidInternalBearer } from "@/modules/integrations/internal-api-auth";

const currentSecret = "current-internal-api-secret-32-characters";
const previousSecret = "previous-internal-api-secret-32-characters";

describe("isValidInternalBearer", () => {
  it("accepts the current internal API secret", () => {
    expect(
      isValidInternalBearer(
        `Bearer ${currentSecret}`,
        currentSecret
      )
    ).toBe(true);
  });

  it("accepts the previous secret only during rotation", () => {
    expect(
      isValidInternalBearer(
        `Bearer ${previousSecret}`,
        currentSecret,
        previousSecret
      )
    ).toBe(true);
    expect(
      isValidInternalBearer(
        `Bearer ${previousSecret}`,
        currentSecret
      )
    ).toBe(false);
  });

  it("rejects missing, malformed, and incorrect credentials", () => {
    expect(isValidInternalBearer(null, currentSecret)).toBe(false);
    expect(
      isValidInternalBearer(`Basic ${currentSecret}`, currentSecret)
    ).toBe(false);
    expect(
      isValidInternalBearer(
        `Bearer ${currentSecret} extra`,
        currentSecret
      )
    ).toBe(false);
    expect(
      isValidInternalBearer(
        "Bearer wrong-secret-with-a-different-length",
        currentSecret
      )
    ).toBe(false);
  });
});
