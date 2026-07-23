import { describe, expect, it } from "vitest";
import {
  InvalidOriginError,
  assertSameOrigin
} from "@/modules/auth/csrf";

describe("same-origin mutation protection", () => {
  const appUrl = "https://recall.righttoken.com";

  it("accepts requests from the configured application origin", () => {
    const request = new Request(`${appUrl}/api/tasks`, {
      method: "POST",
      headers: { Origin: appUrl }
    });

    expect(() => assertSameOrigin(request, appUrl)).not.toThrow();
  });

  it("rejects cross-origin and origin-less mutation requests", () => {
    const crossOrigin = new Request(`${appUrl}/api/tasks`, {
      method: "POST",
      headers: { Origin: "https://attacker.example" }
    });
    const missingOrigin = new Request(`${appUrl}/api/tasks`, {
      method: "POST"
    });

    expect(() => assertSameOrigin(crossOrigin, appUrl)).toThrow(
      InvalidOriginError
    );
    expect(() => assertSameOrigin(missingOrigin, appUrl)).toThrow(
      InvalidOriginError
    );
  });
});
