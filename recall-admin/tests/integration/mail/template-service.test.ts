import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  archiveMailTemplateVersion,
  createMailTemplate,
  publishMailTemplateVersion,
  setMailTemplateEnabled
} from "@/modules/mail/template-service";

describe("versioned public mail templates", () => {
  let primaryAdminId: string;
  let operatorId: string;
  const templateKeys: string[] = [];
  const assetIds: string[] = [];

  beforeAll(async () => {
    const [primaryAdmin, operator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `template-primary-${randomUUID()}@example.test`,
          displayName: "Template Primary Admin",
          passwordHash: "not-used-in-this-test",
          role: "PRIMARY_ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `template-operator-${randomUUID()}@example.test`,
          displayName: "Template Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    primaryAdminId = primaryAdmin.id;
    operatorId = operator.id;
  });

  afterAll(async () => {
    await prisma.mailTemplate.deleteMany({
      where: { key: { in: templateKeys } }
    });
    await prisma.mailAsset.deleteMany({
      where: { id: { in: assetIds } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: [primaryAdminId, operatorId] } }
    });
    await prisma.$disconnect();
  });

  it("lets an operator publish immutable template versions", async () => {
    const asset = await prisma.mailAsset.create({
      data: {
        storageKey: `mail-assets/${randomUUID()}.webp`,
        fileName: "payment-guide.webp",
        contentType: "image/webp",
        byteSize: 1024,
        sha256: "c".repeat(64),
        width: 800,
        height: 600,
        createdById: operatorId
      }
    });
    assetIds.push(asset.id);
    const first = await createMailTemplate({
      actorId: operatorId,
      name: "注册未支付",
      subject: "完成首次支付",
      bodyText: "你好，我们可以协助你完成首次支付。",
      bodyHtml:
        `<p>你好，我们可以协助你完成首次支付。</p>` +
        `<img data-mail-asset-id="${asset.id}" alt="支付说明">`,
      assets: [
        {
          id: asset.id,
          disposition: "INLINE",
          sortOrder: 0
        }
      ]
    });
    templateKeys.push(first.key);

    const second = await publishMailTemplateVersion({
      actorId: operatorId,
      key: first.key,
      name: first.name,
      subject: "首次支付协助",
      bodyText: "你好，如需支付协助请回复此邮件。",
      bodyHtml:
        `<p>你好，如需支付协助请回复此邮件。</p>` +
        `<img data-mail-asset-id="${asset.id}" alt="支付说明">`,
      assets: [
        {
          id: asset.id,
          disposition: "INLINE",
          sortOrder: 0
        }
      ]
    });
    const refreshedFirst =
      await prisma.mailTemplate.findUniqueOrThrow({
        where: { id: first.id }
      });

    expect(first.version).toBe(1);
    expect(refreshedFirst.active).toBe(false);
    expect(second).toMatchObject({
      key: first.key,
      version: 2,
      active: true,
      createdById: operatorId
    });
    expect(
      await prisma.mailTemplate.count({
        where: { key: first.key }
      })
    ).toBe(2);
    await expect(
      prisma.mailTemplateAsset.count({
        where: {
          templateId: second.id,
          assetId: asset.id,
          disposition: "INLINE"
        }
      })
    ).resolves.toBe(1);
  });

  it("lets an operator disable and re-enable the latest version", async () => {
    const created = await createMailTemplate({
      actorId: operatorId,
      name: "余额不足",
      subject: "余额提醒",
      bodyText: "你的余额可能不足，如需协助请回复。"
    });
    templateKeys.push(created.key);

    await setMailTemplateEnabled({
      actorId: operatorId,
      key: created.key,
      enabled: false
    });
    await expect(
      prisma.mailTemplate.findUniqueOrThrow({
        where: { id: created.id }
      })
    ).resolves.toMatchObject({ active: false });

    const enabled = await setMailTemplateEnabled({
      actorId: operatorId,
      key: created.key,
      enabled: true
    });
    expect(enabled).toMatchObject({
      id: created.id,
      active: true
    });
  });

  it("allows only the primary admin to archive a version", async () => {
    const created = await createMailTemplate({
      actorId: operatorId,
      name: "服务异常",
      subject: "服务异常处理",
      bodyText: "我们正在协助处理你的服务异常。"
    });
    templateKeys.push(created.key);

    await expect(
      archiveMailTemplateVersion({
        actorId: operatorId,
        templateId: created.id,
        now: new Date("2026-07-27T12:00:00.000Z")
      })
    ).rejects.toMatchObject({
      name: "ForbiddenError"
    });

    const archived = await archiveMailTemplateVersion({
      actorId: primaryAdminId,
      templateId: created.id,
      now: new Date("2026-07-27T12:00:00.000Z")
    });
    expect(archived).toMatchObject({
      id: created.id,
      active: false,
      archivedAt: new Date("2026-07-27T12:00:00.000Z"),
      archivedById: primaryAdminId
    });
  });
});
