import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InvalidOriginError,
  assertSameOrigin
} from "@/modules/auth/csrf";

describe("same-origin mutation protection", () => {
  const appUrl = "https://recall.righttoken.com";
  const previousAuthMode = process.env.AUTH_MODE;
  const previousDeploymentEnv = process.env.DEPLOYMENT_ENV;

  afterEach(() => {
    process.env.AUTH_MODE = previousAuthMode;
    process.env.DEPLOYMENT_ENV = previousDeploymentEnv;
    vi.unstubAllEnvs();
  });

  it("does not require origin checks during local development", () => {
    process.env.AUTH_MODE = "development";
    process.env.DEPLOYMENT_ENV = "local";
    vi.stubEnv("NODE_ENV", "test");
    const request = new Request(`${appUrl}/api/tasks`, {
      method: "POST"
    });

    expect(() => assertSameOrigin(request, appUrl)).not.toThrow();
  });

  it("does not permit the development bypass in production", () => {
    process.env.AUTH_MODE = "development";
    process.env.DEPLOYMENT_ENV = "production";
    vi.stubEnv("NODE_ENV", "development");
    const request = new Request(`${appUrl}/api/tasks`, {
      method: "POST"
    });

    expect(() => assertSameOrigin(request, appUrl)).toThrow(
      InvalidOriginError
    );
  });

  it("accepts requests from the configured application origin", () => {
    process.env.AUTH_MODE = "righttoken";
    const request = new Request(`${appUrl}/api/tasks`, {
      method: "POST",
      headers: { Origin: appUrl }
    });

    expect(() => assertSameOrigin(request, appUrl)).not.toThrow();
  });

  it("rejects cross-origin and origin-less mutation requests", () => {
    process.env.AUTH_MODE = "righttoken";
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
