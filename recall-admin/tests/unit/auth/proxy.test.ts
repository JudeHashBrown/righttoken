import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import {
  AUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

describe("browser navigation proxy", () => {
  it("redirects an anonymous dashboard navigation to login", () => {
    const response = proxy(
      new NextRequest("https://recall.righttoken.com/dashboard")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://recall.righttoken.com/login?next=%2Fdashboard"
    );
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

  it("keeps an administrator in the required second-factor flow", () => {
    const response = proxy(
      new NextRequest("https://recall.righttoken.com/dashboard", {
        headers: {
          cookie: [
            `${SESSION_COOKIE_NAME}=opaque-token`,
            `${AUTH_STATE_COOKIE_NAME}=enroll`
          ].join("; ")
        }
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://recall.righttoken.com/2fa/setup?mode=enroll"
    );
  });
});
