import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  getIntegrationCredential,
  saveIntegrationCredential
} from "@/modules/integrations/credential-store";

describe("encrypted integration credential store", () => {
  const kind = `WECOM_TEST_${randomUUID()}`;
  let adminId: string;

  beforeAll(async () => {
    const admin = await prisma.member.create({
      data: {
        email: `credential-admin-${randomUUID()}@example.test`,
        displayName: "Credential Admin",
        passwordHash: "not-used-in-this-test",
        role: "ADMIN"
      }
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actorId: adminId, entityType: "IntegrationCredential" }
    });
    await prisma.integrationCredential.deleteMany({ where: { kind } });
    await prisma.member.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("encrypts the full config and returns only safe metadata", async () => {
    const saved = await saveIntegrationCredential(adminId, {
      kind,
      displayName: "企业微信群机器人",
      enabled: true,
      config: {
        webhookUrl:
          "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret-key"
      }
    });

    expect(saved).not.toHaveProperty("encryptedConfig");
    const stored = await prisma.integrationCredential.findUniqueOrThrow({
      where: { kind }
    });
    expect(stored.encryptedConfig).not.toContain("secret-key");
    await expect(getIntegrationCredential(kind)).resolves.toEqual({
      webhookUrl:
        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=secret-key"
    });
  });
});
