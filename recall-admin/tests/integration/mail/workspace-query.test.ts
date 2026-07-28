import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  getMailWorkspaceData
} from "@/modules/mail/workspace-query";

vi.mock("server-only", () => ({}));

describe("scoped mail workspace query", () => {
  let adminId: string;
  let operatorId: string;
  let otherOperatorId: string;
  let ownUserId: string;
  let otherUserId: string;
  let mailboxId: string;
  let ownThreadId: string;
  let otherThreadId: string;
  let templateId: string;

  beforeAll(async () => {
    const [admin, operator, otherOperator] = await Promise.all([
      prisma.member.create({
        data: {
          email: `workspace-admin-${randomUUID()}@example.test`,
          displayName: "Workspace Admin",
          passwordHash: "not-used-in-this-test",
          role: "ADMIN"
        }
      }),
      prisma.member.create({
        data: {
          email: `workspace-operator-${randomUUID()}@example.test`,
          displayName: "Workspace Operator",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      }),
      prisma.member.create({
        data: {
          email: `workspace-other-${randomUUID()}@example.test`,
          displayName: "Workspace Other",
          passwordHash: "not-used-in-this-test",
          role: "OPERATOR"
        }
      })
    ]);
    adminId = admin.id;
    operatorId = operator.id;
    otherOperatorId = otherOperator.id;
    const ownEmail = `workspace-own-${randomUUID()}@example.test`;
    const otherEmail = `workspace-other-${randomUUID()}@example.test`;
    const [ownUser, otherUser] = await Promise.all([
      prisma.userProfile.create({
        data: {
          externalUserId: `workspace-own-${randomUUID()}`,
          email: ownEmail,
          emailNormalized: ownEmail,
          registeredAt: new Date("2026-07-20T08:00:00.000Z"),
          currentSegment: "B",
          ownerId: operatorId
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `workspace-other-${randomUUID()}`,
          email: otherEmail,
          emailNormalized: otherEmail,
          registeredAt: new Date("2026-07-20T08:00:00.000Z"),
          currentSegment: "C",
          ownerId: otherOperatorId
        }
      })
    ]);
    ownUserId = ownUser.id;
    otherUserId = otherUser.id;
    const mailbox = await prisma.mailbox.create({
      data: {
        name: "工作台查询测试邮箱",
        emailAddress: `workspace-support-${randomUUID()}@righttoken.test`,
        encryptedConfig: "encrypted-test-value",
        enabled: true
      }
    });
    mailboxId = mailbox.id;
    const [ownThread, otherThread] = await Promise.all([
      prisma.mailThread.create({
        data: {
          userId: ownUserId,
          mailboxId,
          subject: "自己的邮件会话"
        }
      }),
      prisma.mailThread.create({
        data: {
          userId: otherUserId,
          mailboxId,
          subject: "其他运营的邮件会话"
        }
      })
    ]);
    ownThreadId = ownThread.id;
    otherThreadId = otherThread.id;
    await prisma.mailMessage.createMany({
      data: [
        {
          mailboxId,
          threadId: ownThreadId,
          userId: ownUserId,
          direction: "INBOUND",
          status: "RECEIVED",
          providerMessageId: `<workspace-own-${randomUUID()}@example.test>`,
          references: [],
          fromAddress: ownEmail,
          toAddresses: [mailbox.emailAddress],
          subject: ownThread.subject,
          bodyText: "这是当前运营负责用户的完整来信正文。",
          receivedAt: new Date("2026-07-27T09:00:00.000Z")
        },
        {
          mailboxId,
          threadId: otherThreadId,
          userId: otherUserId,
          direction: "INBOUND",
          status: "RECEIVED",
          providerMessageId: `<workspace-other-${randomUUID()}@example.test>`,
          references: [],
          fromAddress: otherEmail,
          toAddresses: [mailbox.emailAddress],
          subject: otherThread.subject,
          bodyText: "这是其他运营负责用户的来信。",
          receivedAt: new Date("2026-07-27T09:30:00.000Z")
        }
      ]
    });
    await prisma.recallTask.createMany({
      data: [
        {
          userId: ownUserId,
          origin: "EMAIL_REPLY",
          triggerKey: `workspace-own-${randomUUID()}`,
          ruleVersion: 1,
          title: "自己的回复任务",
          reason: "用户回复邮件",
          priority: "IMPORTANT",
          status: "TODO",
          assigneeId: operatorId,
          dueAt: new Date("2026-07-27T13:00:00.000Z")
        },
        {
          userId: otherUserId,
          origin: "EMAIL_REPLY",
          triggerKey: `workspace-other-${randomUUID()}`,
          ruleVersion: 1,
          title: "其他运营的回复任务",
          reason: "用户回复邮件",
          priority: "IMPORTANT",
          status: "TODO",
          assigneeId: otherOperatorId,
          dueAt: new Date("2026-07-27T13:30:00.000Z")
        },
        {
          userId: ownUserId,
          origin: "EMAIL_REPLY",
          triggerKey: `workspace-orphan-${randomUUID()}`,
          ruleVersion: 1,
          title: "没有独立会话的重复回复任务",
          reason: "用于验证统计与会话列表保持一致",
          priority: "IMPORTANT",
          status: "TODO",
          assigneeId: operatorId,
          dueAt: new Date("2026-07-27T14:00:00.000Z")
        }
      ]
    });
    const template = await prisma.mailTemplate.create({
      data: {
        key: `workspace-template-${randomUUID()}`,
        version: 1,
        name: "工作台模板",
        subject: "回复主题",
        bodyText: "回复正文",
        active: true,
        createdById: operatorId
      }
    });
    templateId = template.id;
  });

  afterAll(async () => {
    await prisma.mailTemplate.deleteMany({
      where: { id: templateId }
    });
    await prisma.recallTask.deleteMany({
      where: { userId: { in: [ownUserId, otherUserId] } }
    });
    await prisma.mailbox.deleteMany({ where: { id: mailboxId } });
    await prisma.userProfile.deleteMany({
      where: { id: { in: [ownUserId, otherUserId] } }
    });
    await prisma.member.deleteMany({
      where: {
        id: { in: [adminId, operatorId, otherOperatorId] }
      }
    });
    await prisma.$disconnect();
  });

  it("limits an operator to their own conversations", async () => {
    const data = await getMailWorkspaceData(
      { id: operatorId, role: "OPERATOR" },
      { view: "replies", selectedId: null }
    );

    expect(data.items.some((item) => item.id === ownThreadId)).toBe(
      true
    );
    expect(
      data.items.some((item) => item.id === otherThreadId)
    ).toBe(false);
    expect(data.stats.replyTasks).toBe(data.items.length);

    const pendingData = await getMailWorkspaceData(
      { id: operatorId, role: "OPERATOR" },
      { view: "pending", selectedId: null }
    );
    expect(pendingData.stats.openReplyTasks).toBe(
      pendingData.items.length
    );
  });

  it("lets an admin see all conversations and full selected body", async () => {
    const data = await getMailWorkspaceData(
      { id: adminId, role: "ADMIN" },
      { view: "replies", selectedId: ownThreadId }
    );

    expect(data.items.some((item) => item.id === ownThreadId)).toBe(
      true
    );
    expect(
      data.items.some((item) => item.id === otherThreadId)
    ).toBe(true);
    expect(data.selected).toMatchObject({
      kind: "thread",
      thread: {
        id: ownThreadId,
        messages: [
          {
            bodyText:
              "这是当前运营负责用户的完整来信正文。"
          }
        ]
      }
    });
    expect(
      data.templates.some((template) => template.id === templateId)
    ).toBe(true);
  });
});
