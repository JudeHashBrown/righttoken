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
  const noCompose = {
    compose: false,
    composeUserId: null,
    composeTaskId: null,
    composeRetryMessageId: null
  } as const;
  let adminId: string;
  let operatorId: string;
  let otherOperatorId: string;
  let ownUserId: string;
  let otherUserId: string;
  let mailboxId: string;
  let ownThreadId: string;
  let otherThreadId: string;
  let ownSentMessageId: string;
  let otherSentMessageId: string;
  let ownBouncedMessageId: string;
  let templateId: string;
  let inactiveTemplateKey: string;

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
    const [ownSentMessage, otherSentMessage] =
      await Promise.all([
        prisma.mailMessage.create({
          data: {
            mailboxId,
            threadId: ownThreadId,
            userId: ownUserId,
            direction: "OUTBOUND",
            status: "SENT",
            providerMessageId: `<workspace-own-sent-${randomUUID()}@example.test>`,
            references: [],
            fromAddress: mailbox.emailAddress,
            toAddresses: [ownEmail],
            subject: "已发送给当前运营用户",
            bodyText: "这是当前运营已经发送的完整邮件正文。",
            sentAt: new Date("2026-07-27T10:00:00.000Z")
          }
        }),
        prisma.mailMessage.create({
          data: {
            mailboxId,
            threadId: otherThreadId,
            userId: otherUserId,
            direction: "OUTBOUND",
            status: "SENT",
            providerMessageId: `<workspace-other-sent-${randomUUID()}@example.test>`,
            references: [],
            fromAddress: mailbox.emailAddress,
            toAddresses: [otherEmail],
            subject: "已发送给其他运营用户",
            bodyText: "这是其他运营已经发送的邮件正文。",
            sentAt: new Date("2026-07-27T10:30:00.000Z")
          }
        })
      ]);
    ownSentMessageId = ownSentMessage.id;
    otherSentMessageId = otherSentMessage.id;
    const ownBouncedMessage = await prisma.mailMessage.create({
      data: {
        mailboxId,
        threadId: ownThreadId,
        userId: ownUserId,
        direction: "OUTBOUND",
        status: "BOUNCED",
        providerMessageId: `<workspace-own-bounced-${randomUUID()}@example.test>`,
        references: [],
        fromAddress: mailbox.emailAddress,
        toAddresses: [ownEmail],
        subject: "最终退信邮件",
        bodyText: "这封邮件被收件服务器最终拒收。",
        bodyHtml: "<p>这封邮件被收件服务器最终拒收。</p>",
        sentAt: new Date("2026-07-27T11:00:00.000Z"),
        bouncedAt: new Date("2026-07-27T11:05:00.000Z"),
        bounceStatusCode: "5.1.1",
        bounceDiagnostic: "smtp; 550 mailbox unavailable"
      }
    });
    ownBouncedMessageId = ownBouncedMessage.id;
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
    inactiveTemplateKey = `workspace-inactive-${randomUUID()}`;
    await prisma.mailTemplate.createMany({
      data: [
        {
          key: inactiveTemplateKey,
          version: 1,
          name: "已停用旧版本",
          subject: "旧主题",
          bodyText: "旧正文",
          active: false,
          createdById: operatorId
        },
        {
          key: inactiveTemplateKey,
          version: 2,
          name: "已停用模板",
          subject: "最新主题",
          bodyText: "最新正文",
          active: false,
          createdById: operatorId
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.mailTemplate.deleteMany({
      where: {
        OR: [
          { id: templateId },
          { key: inactiveTemplateKey }
        ]
      }
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
      { view: "replies", selectedId: null, ...noCompose }
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
      { view: "pending", selectedId: null, ...noCompose }
    );
    expect(pendingData.stats.openReplyTasks).toBe(
      pendingData.items.length
    );
    expect(pendingData.filter.selectedId).toBe(ownThreadId);
    expect(pendingData.selected).toMatchObject({
      kind: "thread",
      thread: { id: ownThreadId }
    });

    const explicitlySelected = await getMailWorkspaceData(
      { id: adminId, role: "ADMIN" },
      {
        view: "pending",
        selectedId: otherThreadId,
        ...noCompose
      }
    );
    expect(explicitlySelected.filter.selectedId).toBe(
      otherThreadId
    );
    expect(explicitlySelected.selected).toMatchObject({
      kind: "thread",
      thread: { id: otherThreadId }
    });
  });

  it("lets an admin see all conversations and full selected body", async () => {
    const data = await getMailWorkspaceData(
      { id: adminId, role: "ADMIN" },
      {
        view: "replies",
        selectedId: ownThreadId,
        ...noCompose
      }
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
        messages: expect.arrayContaining([
          expect.objectContaining({
            bodyText:
              "这是当前运营负责用户的完整来信正文。"
          })
        ])
      }
    });
    expect(
      data.templates.some((template) => template.id === templateId)
    ).toBe(true);
    expect(data.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: inactiveTemplateKey,
          version: 2,
          active: false
        })
      ])
    );
    expect(
      data.templates.filter(
        (template) => template.key === inactiveTemplateKey
      )
    ).toHaveLength(1);
  });

  it("lists sent messages within scope and returns the selected full message", async () => {
    const operatorData = await getMailWorkspaceData(
      { id: operatorId, role: "OPERATOR" },
      {
        view: "sent",
        selectedId: ownSentMessageId,
        ...noCompose
      }
    );

    expect(
      operatorData.items.some(
        (item) => item.id === ownSentMessageId
      )
    ).toBe(true);
    expect(
      operatorData.items.some(
        (item) => item.id === otherSentMessageId
      )
    ).toBe(false);
    expect(operatorData.stats.sentMessages).toBe(
      operatorData.items.length
    );
    expect(operatorData.selected).toMatchObject({
      kind: "message",
      message: {
        id: ownSentMessageId,
        bodyText: "这是当前运营已经发送的完整邮件正文。",
        sentAt: "2026-07-27T10:00:00.000Z"
      }
    });

    const adminData = await getMailWorkspaceData(
      { id: adminId, role: "ADMIN" },
      {
        view: "sent",
        selectedId: null,
        ...noCompose
      }
    );
    expect(
      adminData.items.some(
        (item) => item.id === otherSentMessageId
      )
    ).toBe(true);
  });

  it("lists final bounces in failed mail with safe retry diagnostics", async () => {
    const data = await getMailWorkspaceData(
      { id: operatorId, role: "OPERATOR" },
      {
        view: "failed",
        selectedId: ownBouncedMessageId,
        ...noCompose
      }
    );

    expect(
      data.items.find((item) => item.id === ownBouncedMessageId)
    ).toMatchObject({ status: "最终退信" });
    expect(data.selected).toMatchObject({
      kind: "message",
      message: {
        id: ownBouncedMessageId,
        status: "BOUNCED",
        userId: ownUserId,
        bounceStatusCode: "5.1.1",
        bounceDiagnostic: "smtp; 550 mailbox unavailable"
      }
    });
  });

  it("returns operational mailbox status and selected recovery detail", async () => {
    await prisma.mailbox.update({
      where: { id: mailboxId },
      data: {
        lastErrorCode: "IMAP_AUTH_FAILED",
        lastTestedAt: new Date("2026-07-28T08:00:00.000Z")
      }
    });

    const data = await getMailWorkspaceData(
      { id: adminId, role: "ADMIN" },
      {
        view: "mailboxes",
        selectedId: mailboxId,
        ...noCompose
      }
    );

    expect(
      data.items.find((item) => item.id === mailboxId)?.preview
    ).toBe("邮箱账号、密码或授权未通过");
    expect(data.selected).toMatchObject({
      kind: "mailbox",
      mailbox: {
        id: mailboxId,
        statusText: "邮箱账号、密码或授权未通过",
        lastTestedAt: "2026-07-28T08:00:00.000Z"
      }
    });
  });
});
