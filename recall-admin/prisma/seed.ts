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

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString },
    { schema: "recall" }
  )
});

const defaultLocationRules = [
  ["QQ 邮箱", "EXACT_DOMAIN", "qq.com", "CN"],
  ["QQ 会员邮箱", "EXACT_DOMAIN", "vip.qq.com", "CN"],
  ["Foxmail", "EXACT_DOMAIN", "foxmail.com", "CN"],
  ["网易 163 邮箱", "EXACT_DOMAIN", "163.com", "CN"],
  ["网易 126 邮箱", "EXACT_DOMAIN", "126.com", "CN"],
  ["网易 Yeah 邮箱", "EXACT_DOMAIN", "yeah.net", "CN"],
  ["新浪邮箱", "EXACT_DOMAIN", "sina.com", "CN"],
  ["新浪中国邮箱", "EXACT_DOMAIN", "sina.cn", "CN"],
  ["搜狐邮箱", "EXACT_DOMAIN", "sohu.com", "CN"],
  ["Mail.ru", "EXACT_DOMAIN", "mail.ru", "RU"],
  ["Inbox.ru", "EXACT_DOMAIN", "inbox.ru", "RU"],
  ["List.ru", "EXACT_DOMAIN", "list.ru", "RU"],
  ["BK.ru", "EXACT_DOMAIN", "bk.ru", "RU"],
  ["Internet.ru", "EXACT_DOMAIN", "internet.ru", "RU"],
  ["Yandex Russia", "EXACT_DOMAIN", "yandex.ru", "RU"],
  ["Ya.ru", "EXACT_DOMAIN", "ya.ru", "RU"],
  ["Rambler", "EXACT_DOMAIN", "rambler.ru", "RU"],
  ["Yandex Belarus", "EXACT_DOMAIN", "yandex.by", "BY"],
  ["Mail.by", "EXACT_DOMAIN", "mail.by", "BY"],
  ["Mail.kz", "EXACT_DOMAIN", "mail.kz", "KZ"],
  ["Yandex Kazakhstan", "EXACT_DOMAIN", "yandex.kz", "KZ"],
  ["uMail Uzbekistan", "EXACT_DOMAIN", "umail.uz", "UZ"],
  ["Kmail Kyrgyzstan", "EXACT_DOMAIN", "kmail.kg", "KG"]
] as const;

const defaultCountrySuffixes = {
  CN: [".cn", ".xn--fiqs8s", ".xn--fiqz9s"],
  RU: [".ru", ".xn--p1ai"],
  BY: [".by", ".xn--90ais"],
  KZ: [".kz"],
  KG: [".kg"],
  UZ: [".uz"],
  TJ: [".tj"],
  TM: [".tm"],
  AM: [".am"],
  AZ: [".az"],
  GE: [".ge"],
  US: [".us"],
  GB: [".uk"],
  IE: [".ie"],
  DE: [".de"],
  AT: [".at"],
  CH: [".ch"],
  LI: [".li"],
  FR: [".fr"],
  BE: [".be"],
  NL: [".nl"],
  LU: [".lu"],
  IT: [".it"],
  ES: [".es"],
  PT: [".pt"],
  GR: [".gr"],
  MT: [".mt"],
  CY: [".cy"],
  SE: [".se"],
  NO: [".no"],
  DK: [".dk"],
  FI: [".fi"],
  IS: [".is"],
  PL: [".pl"],
  CZ: [".cz"],
  SK: [".sk"],
  HU: [".hu"],
  RO: [".ro"],
  BG: [".bg"],
  SI: [".si"],
  HR: [".hr"],
  RS: [".rs"],
  BA: [".ba"],
  MK: [".mk"],
  AL: [".al"],
  EE: [".ee"],
  LV: [".lv"],
  LT: [".lt"],
  UA: [".ua"],
  MD: [".md"],
  EU: [".eu"]
} as const;

async function seedLocationAttributionRules(): Promise<void> {
  const rules = [
    ...defaultLocationRules.map(
      ([name, matchType, pattern, countryCode], index) => ({
        name,
        matchType,
        pattern,
        countryCode,
        priority: index + 1
      })
    ),
    ...Object.entries(defaultCountrySuffixes).flatMap(
      ([countryCode, patterns]) =>
        patterns.map((pattern) => ({
          name: `${countryCode} 国家域名`,
          matchType: "DOMAIN_SUFFIX" as const,
          pattern,
          countryCode,
          priority: 0
        }))
    )
  ].map((rule, index) => ({ ...rule, priority: index + 1 }));

  for (const rule of rules) {
    await prisma.locationAttributionRule.upsert({
      where: {
        matchType_pattern: {
          matchType: rule.matchType,
          pattern: rule.pattern
        }
      },
      create: { ...rule, enabled: true },
      update: {
        name: rule.name,
        countryCode: rule.countryCode,
        priority: rule.priority
      }
    });
  }
}

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
      anomalySnapshot: {
        anomalyErrorPhase: "upstream",
        anomalyErrorType: "no_available_account",
        anomalyErrorMessage: "no accounts available",
        anomalyErrorOwner: "provider",
        anomalyStatusCode: 503,
        anomalyModel: "gpt-4.1",
        anomalyPlatform: "OpenAI",
        anomalyRequestCount: 12,
        anomalyFailureCount: 12,
        anomalyConsecutiveFailures: 5,
        anomalyLastOccurredAt: now.toISOString()
      },
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
    displayName: "主管理员"
  });
  await seedLocationAttributionRules();
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
