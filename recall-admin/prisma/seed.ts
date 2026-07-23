import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapPrimaryAdmin } from "../src/modules/auth/bootstrap-primary-admin";

function requireSeedValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for database seeding`);
  }
  return value;
}

const connectionString = requireSeedValue("DATABASE_URL");
const primaryAdminEmail = requireSeedValue(
  "SEED_PRIMARY_ADMIN_EMAIL"
).toLowerCase();
const primaryAdminPassword = requireSeedValue(
  "SEED_PRIMARY_ADMIN_PASSWORD"
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

async function seedSyntheticUsers(): Promise<void> {
  const segments = ["A", "B", "C", "D", "E", "F", "G"] as const;
  const countsBySegment = {
    A: 18,
    B: 9,
    C: 7,
    D: 11,
    E: 6,
    F: 3,
    G: 26
  } as const;
  const locations = [
    { countryCode: "SG", region: "新加坡" },
    { countryCode: "US", region: "美国西部" },
    { countryCode: "DE", region: "德国" },
    { countryCode: "JP", region: "日本" },
    { countryCode: "BR", region: "巴西" },
    { countryCode: "AE", region: "阿联酋" },
    { countryCode: "HK", region: "中国香港" }
  ] as const;
  const now = new Date();

  for (const [segmentIndex, segment] of segments.entries()) {
    const slug = segment.toLowerCase();
    const location = locations[segmentIndex];

    for (let index = 1; index <= countsBySegment[segment]; index += 1) {
      const suffix = index === 1 ? "" : `-${String(index).padStart(2, "0")}`;
      const externalUserId = `demo-${slug}${suffix}`;
      const email = `${externalUserId}@example.test`;
      const displayName = `模拟用户 ${segment}-${String(index).padStart(2, "0")}`;

      await prisma.userProfile.upsert({
        where: { externalUserId },
        create: {
          externalUserId,
          email,
          emailNormalized: email,
          displayName,
          registeredAt: new Date(
            now.getTime() - (index + segmentIndex) * 60 * 60 * 1000
          ),
          countryCode: location.countryCode,
          region: location.region,
          language: "zh-CN",
          source: "safe-seed",
          currentSegment: segment
        },
        update: {
          email,
          emailNormalized: email,
          displayName,
          countryCode: location.countryCode,
          region: location.region,
          language: "zh-CN",
          source: "safe-seed",
          currentSegment: segment
        }
      });
    }
  }
}

async function seedSyntheticTasks(): Promise<void> {
  const primaryAdmin = await prisma.member.findUniqueOrThrow({
    where: { email: primaryAdminEmail },
    select: { id: true }
  });
  const users = await prisma.userProfile.findMany({
    where: {
      externalUserId: {
        in: [
          "demo-a",
          "demo-b",
          "demo-c",
          "demo-d",
          "demo-e",
          "demo-f",
          "demo-g"
        ]
      }
    },
    select: { id: true, externalUserId: true }
  });
  const userIds = new Map(
    users.map((user) => [user.externalUserId, user.id])
  );
  const now = new Date();
  const hour = 60 * 60 * 1000;
  const taskDefinitions = [
    {
      externalUserId: "demo-f",
      triggerKey: "safe-seed:service-anomaly",
      origin: "AUTOMATION" as const,
      title: "服务异常需要立即介入",
      reason: "模拟连续调用失败告警",
      priority: "URGENT" as const,
      status: "TODO" as const,
      dueAt: new Date(now.getTime() - 30 * 60 * 1000),
      assigneeId: primaryAdmin.id
    },
    {
      externalUserId: "demo-b",
      triggerKey: "safe-seed:checkout-unpaid",
      origin: "AUTOMATION" as const,
      title: "支付流程中断，等待跟进",
      reason: "模拟进入支付后 30 分钟未完成",
      priority: "IMPORTANT" as const,
      status: "TODO" as const,
      dueAt: new Date(now.getTime() + 45 * 60 * 1000),
      assigneeId: primaryAdmin.id
    },
    {
      externalUserId: "demo-g",
      triggerKey: "safe-seed:email-reply",
      origin: "EMAIL_REPLY" as const,
      title: "用户邮件回复待处理",
      reason: "模拟用户回复客服邮件",
      priority: "IMPORTANT" as const,
      status: "UNASSIGNED" as const,
      dueAt: new Date(now.getTime() + 2 * hour),
      assigneeId: null
    },
    {
      externalUserId: "demo-c",
      triggerKey: "safe-seed:paid-no-call",
      origin: "AUTOMATION" as const,
      title: "充值后尚未完成首次调用",
      reason: "模拟充值 24 小时未调用",
      priority: "IMPORTANT" as const,
      status: "TODO" as const,
      dueAt: new Date(now.getTime() + 3 * hour),
      assigneeId: primaryAdmin.id
    },
    {
      externalUserId: "demo-a",
      triggerKey: "safe-seed:registered-unpaid",
      origin: "AUTOMATION" as const,
      title: "注册满 2 小时仍未支付",
      reason: "模拟注册后首单未完成",
      priority: "NORMAL" as const,
      status: "UNASSIGNED" as const,
      dueAt: new Date(now.getTime() + 5 * hour),
      assigneeId: null
    },
    {
      externalUserId: "demo-e",
      triggerKey: "safe-seed:balance-empty",
      origin: "AUTOMATION" as const,
      title: "余额耗尽后尚未复充",
      reason: "模拟余额耗尽观察期结束",
      priority: "NORMAL" as const,
      status: "IN_PROGRESS" as const,
      dueAt: new Date(now.getTime() + 7 * hour),
      assigneeId: primaryAdmin.id
    },
    {
      externalUserId: "demo-d",
      triggerKey: "safe-seed:completed-recall",
      origin: "AUTOMATION" as const,
      title: "调用后停用用户召回",
      reason: "模拟已完成的召回任务",
      priority: "NORMAL" as const,
      status: "COMPLETED" as const,
      dueAt: new Date(now.getTime() - 2 * hour),
      completedAt: new Date(now.getTime() - hour),
      assigneeId: primaryAdmin.id
    }
  ];

  for (const task of taskDefinitions) {
    const { externalUserId, ...taskData } = task;
    const userId = userIds.get(externalUserId);
    if (!userId) {
      throw new Error(`missing synthetic user ${externalUserId}`);
    }

    await prisma.recallTask.upsert({
      where: {
        userId_triggerKey_ruleVersion: {
          userId,
          triggerKey: task.triggerKey,
          ruleVersion: 1
        }
      },
      create: {
        userId,
        ruleVersion: 1,
        ...taskData
      },
      update: taskData
    });
  }
}

async function main(): Promise<void> {
  await bootstrapPrimaryAdmin({
    email: primaryAdminEmail,
    password: primaryAdminPassword,
    displayName: "主管理员"
  });
  await seedSyntheticUsers();
  await seedSyntheticTasks();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
