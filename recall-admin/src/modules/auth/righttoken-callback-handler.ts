import { NextRequest, NextResponse } from "next/server";
import type { Member } from "@/generated/prisma/client";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  type CreatedSession
} from "@/modules/auth/session";
import type {
  RightTokenIdentity,
  RightTokenTicketConfig
} from "@/modules/auth/righttoken-ticket";

const allowedNextRoots = new Set([
  "/dashboard",
  "/tasks",
  "/users",
  "/mail",
  "/automation",
  "/reports",
  "/members",
  "/settings"
]);

export type RightTokenCallbackConfig =
  RightTokenTicketConfig & {
    appUrl: string;
  };

export type RightTokenCallbackDependencies = {
  getConfig(): RightTokenCallbackConfig;
  verifyTicket(
    ticket: string,
    config: RightTokenTicketConfig
  ): RightTokenIdentity;
  resolveMember(
    identity: RightTokenIdentity
  ): Promise<Member | null>;
  redeemJti(identity: RightTokenIdentity): Promise<boolean>;
  createSession(memberId: string): Promise<CreatedSession>;
};

function safeNext(raw: string | null): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }
  try {
    const parsed = new URL(raw, "https://recall.invalid");
    if (parsed.origin !== "https://recall.invalid") {
      return "/dashboard";
    }
    const root = `/${parsed.pathname.split("/")[1]}`;
    return allowedNextRoots.has(root)
      ? `${parsed.pathname}${parsed.search}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export function createRightTokenSsoCallbackHandler(
  dependencies: RightTokenCallbackDependencies
) {
  return async function rightTokenSsoCallback(
    request: NextRequest
  ): Promise<NextResponse> {
    const ticket = request.nextUrl.searchParams.get("ticket");
    if (!ticket) {
      return NextResponse.json(
        { code: "INVALID_SSO_TICKET" },
        { status: 401 }
      );
    }

    const config = dependencies.getConfig();
    let identity: RightTokenIdentity;
    try {
      identity = dependencies.verifyTicket(ticket, config);
    } catch {
      return NextResponse.json(
        { code: "INVALID_SSO_TICKET" },
        { status: 401 }
      );
    }

    const member = await dependencies
      .resolveMember(identity)
      .catch(() => null);
    if (!member?.active) {
      return NextResponse.json(
        { code: "RECALL_ACCESS_DENIED" },
        { status: 403 }
      );
    }

    const redeemed = await dependencies
      .redeemJti(identity)
      .catch(() => false);
    if (!redeemed) {
      return NextResponse.json(
        { code: "SSO_TICKET_REPLAYED" },
        { status: 401 }
      );
    }

    let session: CreatedSession;
    try {
      session = await dependencies.createSession(member.id);
    } catch {
      return NextResponse.json(
        { code: "SSO_SESSION_UNAVAILABLE" },
        { status: 503 }
      );
    }

    const target = new URL(
      safeNext(request.nextUrl.searchParams.get("next")),
      config.appUrl
    );
    const response = NextResponse.redirect(target);
    response.cookies.set(
      SESSION_COOKIE_NAME,
      session.token,
      sessionCookieOptions(session.expiresAt)
    );
    return response;
  };
}
