import "dotenv/config";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as saveWecomApp } from "@/app/api/integrations/wecom/app/route";
import { POST as testWecomApp } from "@/app/api/integrations/wecom/app/test/route";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  revokeSessionByToken,
  SESSION_COOKIE_NAME
} from "@/modules/auth/session";

function request(path: string, token: string, body: unknown) {
  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:3000",
      cookie: `${SESSION_COOKIE_NAME}=${token}`
    },
    body: JSON.stringify(body)
  });
}

describe("WeCom app integration routes", () => {
  let adminId: string;
  let sessionToken: string;

  beforeAll(async () => {
    adminId = (
      await prisma.member.findFirstOrThrow({
        where: { role: "PRIMARY_ADMIN", active: true },
        select: { id: true }
      })
    ).id;
    sessionToken = (await createSession(adminId)).token;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await revokeSessionByToken(sessionToken);
    await prisma.auditLog.deleteMany({
      where: {
        actorId: adminId,
        action: "integration.credential_saved",
        entityType: "IntegrationCredential"
      }
    });
    await prisma.integrationCredential.deleteMany({
      where: { kind: "WECOM_APP" }
    });
    await prisma.$disconnect();
  });

  it("saves encrypted application credentials without returning the secret", async () => {
    const response = await saveWecomApp(
      request("/api/integrations/wecom/app", sessionToken, {
        displayName: "企微自建应用",
        enabled: true,
        corpId: "ww-test-corp",
        agentId: "1000002",
        secret: "route-test-secret"
      })
    );

    expect(response.status).toBe(201);
    const body = await response.text();
    expect(body).not.toContain("route-test-secret");
    expect(body).not.toContain("ww-test-corp");
    const stored =
      await prisma.integrationCredential.findUniqueOrThrow({
        where: { kind: "WECOM_APP" }
      });
    expect(stored.encryptedConfig).not.toContain(
      "route-test-secret"
    );
    expect(stored.metadata).toMatchObject({
      corpIdSuffix: "corp",
      agentId: "1000002"
    });
  });

  it("sends a privacy-safe connection test to an explicit member", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            access_token: "test-token",
            expires_in: 7200
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            msgid: "test-message"
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await testWecomApp(
      request(
        "/api/integrations/wecom/app/test",
        sessionToken,
        { recipient: "internal-test-member" }
      )
    );

    expect(response.status).toBe(200);
    const sentBody = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(sentBody).toContain("internal-test-member");
    expect(sentBody).not.toContain("@");
    expect(sentBody).not.toContain("registrationIp");
  });
});
