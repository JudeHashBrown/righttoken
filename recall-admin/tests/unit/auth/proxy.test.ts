import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/modules/auth/session";

describe("browser navigation proxy", () => {
  const previousAuthMode = process.env.AUTH_MODE;
  const previousDeploymentEnv = process.env.DEPLOYMENT_ENV;

  beforeEach(() => {
    process.env.AUTH_MODE = "development";
    process.env.DEPLOYMENT_ENV = "local";
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    process.env.AUTH_MODE = previousAuthMode;
    process.env.DEPLOYMENT_ENV = previousDeploymentEnv;
    vi.unstubAllEnvs();
  });

  it("lets anonymous local development navigation reach the dashboard", () => {
    const response = proxy(
      new NextRequest("https://recall.righttoken.com/dashboard")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a navigation with a session cookie reach the page", () => {
    const response = proxy(
      new NextRequest("https://recall.righttoken.com/dashboard", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=opaque-token`
        }
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows an invited member to open the acceptance page", () => {
    const response = proxy(
      new NextRequest(
        "https://recall.righttoken.com/members/invitations/accept?token=opaque"
      )
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("ignores obsolete second-factor cookies in development", () => {
    const response = proxy(
      new NextRequest("https://recall.righttoken.com/dashboard", {
        headers: {
          cookie: [
            `${SESSION_COOKIE_NAME}=opaque-token`,
            "rt_recall_auth_state=enroll"
          ].join("; ")
        }
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("never enables login-free navigation in production", () => {
    process.env.DEPLOYMENT_ENV = "production";
    vi.stubEnv("NODE_ENV", "development");

    const response = proxy(
      new NextRequest("https://recall.righttoken.ai/dashboard")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
