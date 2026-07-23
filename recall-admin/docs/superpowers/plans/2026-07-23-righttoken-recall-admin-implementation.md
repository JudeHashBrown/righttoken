# RightToken 用户跟踪与召回管理后台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可部署到 `recall.righttoken.ai` 的真实运营后台，自动管理用户事件、A–G 分组、运营任务、地区分配、提醒与人工审核邮件，并为未来 RightToken 正式数据接入保留稳定接口。

**Architecture:** 使用 Next.js 16 App Router 构建模块化单体 Web 应用，业务规则位于 `src/modules/*`，页面与路由只调用模块服务。PostgreSQL 16 保存业务数据和 pg-boss 任务队列；同一镜像分别以 Web 与 Worker 进程运行。所有外部系统通过 RightToken、SMTP/IMAP、企业微信群机器人适配器接入。

**Tech Stack:** Node.js 24.18 LTS、npm、Next.js 16、React 19、TypeScript 5、Tailwind CSS、PostgreSQL 16、Prisma ORM 7、pg-boss、Zod、Argon2、otplib、Nodemailer、ImapFlow、Vitest、Testing Library、Playwright、Docker Compose。

## Global Constraints

- 首版规模为总用户少于 1 万、每日新增少于 500。
- 系统必须只有一个主管理员，但允许多个管理员和运营人员。
- CSV 导出只能由主管理员执行，并要求重新验证与审计。
- 用户邮件必须经过运营预览或修改后发送，禁止无人审核的自动发送。
- 当前阶段使用模拟数据和 CSV；不连接 RightToken 正式数据库，但实时事件和全量校准接口必须完整。
- 真实邮箱、完整 IP、生产凭据不得进入浏览器代码、测试夹具、日志或版本库。
- 实际产品页面不得出现设计方案标题、方案解释或模块说明卡片。
- 运营首页必须使用已确认的深色侧栏、浅色内容区“运营驾驶舱”结构。
- Namecheap 与企业微信邮箱通过通用 SMTP/IMAP 适配器接入；企业微信提醒使用群机器人。
- 生产运行时固定为 Node.js 24 LTS；本机 Node.js 25 已 EOL，只允许通过 Node 24 容器或 Node 24 本地环境执行安装、构建和测试。

## Verified Runtime Baseline

- Node.js 官方将 v24 标记为 LTS，生产应用应使用 LTS，而当前本机 v25 已 EOL：<https://nodejs.org/en/about/previous-releases>
- Next.js 16 官方要求 Node.js 20.9+，支持 App Router 与 Docker 部署：<https://nextjs.org/blog/next-16>、<https://nextjs.org/docs/app/getting-started/deploying>
- Prisma 官方支持 Node.js 24 和 PostgreSQL 16：<https://docs.prisma.io/docs/orm/reference/system-requirements>

## File Structure

```text
.
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   ├── tasks/
│   │   │   ├── users/
│   │   │   ├── mail/
│   │   │   ├── automation/
│   │   │   ├── reports/
│   │   │   ├── members/
│   │   │   └── settings/
│   │   └── api/
│   ├── components/
│   │   ├── layout/
│   │   ├── dashboard/
│   │   ├── tables/
│   │   └── forms/
│   ├── lib/
│   │   ├── db/
│   │   ├── env/
│   │   ├── crypto/
│   │   └── time/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── segmentation/
│   │   ├── tasks/
│   │   ├── assignment/
│   │   ├── automation/
│   │   ├── notifications/
│   │   ├── mail/
│   │   ├── imports/
│   │   ├── reports/
│   │   ├── audit/
│   │   └── integrations/
│   └── worker/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── e2e/
├── scripts/
├── Dockerfile
├── compose.yaml
└── docs/
```

---

### Task 1: Project Foundation and Test Harness

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/lib/env/server.ts`
- Test: `tests/unit/env/server.test.ts`

**Interfaces:**
- Produces: lazy `getServerEnv()` with validated `DATABASE_URL`, `SESSION_COOKIE_SECRET`, `APP_ENCRYPTION_KEY`, `APP_URL`, `JOB_DATABASE_URL`.
- Produces: standard scripts `dev`, `build`, `start`, `worker`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `db:migrate`, `db:deploy`, `db:seed`.

- [ ] **Step 1: Pin the production runtime**

Create `.nvmrc`:

```text
24.18.0
```

Create the initial `package.json`:

```json
{
  "name": "righttoken-recall-admin",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=24.18.0 <25"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx src/worker/index.ts",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration tests/contract",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Install framework, domain, integration, and test dependencies under Node 24**

Run:

```bash
npm install next@latest react@latest react-dom@latest @prisma/client@latest @prisma/adapter-pg@latest pg zod argon2 otplib qrcode nodemailer imapflow mailparser pg-boss csv-parse csv-stringify date-fns lucide-react clsx
npm install -D prisma@latest typescript @types/node @types/react @types/react-dom @types/pg @types/nodemailer @types/mailparser @types/qrcode tsx eslint eslint-config-next vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom @playwright/test
```

Expected: `package-lock.json` is created and `npm ls --depth=0` exits 0.

- [ ] **Step 3: Write a failing server environment test**

Create `tests/unit/env/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env/server";

describe("parseServerEnv", () => {
  it("rejects secrets that are too short", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
        JOB_DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
        SESSION_COOKIE_SECRET: "short",
        APP_ENCRYPTION_KEY: "short",
        APP_URL: "https://recall.righttoken.ai"
      })
    ).toThrow();
  });

  it("accepts the complete production shape", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
      JOB_DATABASE_URL: "postgresql://app:app@db:5432/righttoken_recall",
      SESSION_COOKIE_SECRET: "s".repeat(32),
      APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
      APP_URL: "https://recall.righttoken.ai"
    });
    expect(env.APP_URL).toBe("https://recall.righttoken.ai");
  });
});
```

- [ ] **Step 4: Run the unit test to verify it fails**

Run:

```bash
npm test -- tests/unit/env/server.test.ts
```

Expected: FAIL because `@/lib/env/server` does not exist.

- [ ] **Step 5: Implement strict server environment validation**

Create `src/lib/env/server.ts`:

```ts
import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  JOB_DATABASE_URL: z.string().url(),
  SESSION_COOKIE_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, "must decode to 32 bytes"),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(input);
}

let cachedServerEnv: ServerEnv | undefined;
export function getServerEnv(): ServerEnv {
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}
```

Create `.env.example` with non-secret placeholders:

```dotenv
DATABASE_URL=postgresql://righttoken:righttoken@localhost:5432/righttoken_recall
JOB_DATABASE_URL=postgresql://righttoken:righttoken@localhost:5432/righttoken_recall
SESSION_COOKIE_SECRET=replace-with-at-least-32-random-characters
APP_ENCRYPTION_KEY=replace-with-a-base64-encoded-32-byte-key
APP_URL=http://localhost:3000
```

- [ ] **Step 6: Add Next.js, TypeScript, Vitest, Playwright, and global style configuration**

Configure `tsconfig.json` with strict mode and `@/* -> src/*`; configure `vitest.config.ts` with `environment: "node"` and the same alias; configure `playwright.config.ts` to use `http://127.0.0.1:3000`; create a minimal Chinese root layout.

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RightToken 用户运营",
  description: "用户跟踪、分组与召回管理后台"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Run foundation verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit the foundation**

```bash
git add package.json package-lock.json .nvmrc .env.example tsconfig.json next.config.ts postcss.config.mjs vitest.config.ts playwright.config.ts src/app src/lib/env tests/unit/env
git commit -m "chore: scaffold RightToken recall admin"
```

---

### Task 2: Core Database Schema and Safe Seed Data

**Files:**
- Create: `prisma.config.ts`
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db/prisma.ts`
- Create: `src/lib/db/transaction.ts`
- Create: `src/lib/crypto/field-encryption.ts`
- Create: `tests/integration/db/schema.test.ts`
- Create: `tests/unit/crypto/field-encryption.test.ts`
- Modify: `compose.yaml`

**Interfaces:**
- Produces: `prisma` singleton.
- Produces: `encryptField(plaintext: string): string` and `decryptField(ciphertext: string): string`.
- Produces core Prisma types: `Member`, `Session`, `UserProfile`, `UserEvent`, `SegmentHistory`, `RecallTask`, `TaskActivity`, `AuditLog`.

- [ ] **Step 1: Write failing field-encryption tests**

Create `tests/unit/crypto/field-encryption.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFieldCipher } from "@/lib/crypto/field-encryption";

describe("field encryption", () => {
  it("round-trips without exposing plaintext", () => {
    const cipher = createFieldCipher(Buffer.alloc(32, 7));
    const encrypted = cipher.encrypt("203.0.113.42");
    expect(encrypted).not.toContain("203.0.113.42");
    expect(cipher.decrypt(encrypted)).toBe("203.0.113.42");
  });

  it("rejects tampered ciphertext", () => {
    const cipher = createFieldCipher(Buffer.alloc(32, 7));
    const encrypted = cipher.encrypt("secret");
    expect(() => cipher.decrypt(`${encrypted.slice(0, -1)}A`)).toThrow();
  });
});
```

- [ ] **Step 2: Run the encryption test to verify it fails**

Run:

```bash
npm test -- tests/unit/crypto/field-encryption.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement AES-256-GCM field encryption**

Create `src/lib/crypto/field-encryption.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function createFieldCipher(key: Buffer) {
  if (key.length !== 32) throw new Error("encryption key must be 32 bytes");
  return {
    encrypt(plaintext: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${body.toString("base64url")}`;
    },
    decrypt(value: string) {
      const [version, iv, tag, body] = value.split(".");
      if (version !== "v1" || !iv || !tag || !body) throw new Error("invalid ciphertext");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final()
      ]).toString("utf8");
    }
  };
}
```

- [ ] **Step 4: Define the first complete domain schema**

Create `prisma/schema.prisma` with these exact enums and models:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum MemberRole {
  PRIMARY_ADMIN
  ADMIN
  OPERATOR
}

enum SegmentCode {
  A
  B
  C
  D
  E
  F
  G
}

enum TaskPriority {
  URGENT
  IMPORTANT
  NORMAL
}

enum TaskStatus {
  UNASSIGNED
  TODO
  IN_PROGRESS
  WAITING_USER
  COMPLETED
  PAUSED
  CANCELLED
}

enum TaskOrigin {
  AUTOMATION
  MANUAL
  EMAIL_REPLY
}

model Member {
  id              String      @id @default(cuid())
  email           String      @unique
  displayName     String
  passwordHash    String
  role            MemberRole
  active          Boolean     @default(true)
  twoFactorSecret String?
  twoFactorOn     Boolean     @default(false)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  sessions        Session[]
  assignedTasks   RecallTask[] @relation("TaskAssignee")
  ownedUsers      UserProfile[] @relation("UserOwner")
  notes           UserNote[]
  auditLogs       AuditLog[]  @relation("AuditActor")
}

model Session {
  id              String   @id @default(cuid())
  memberId        String
  tokenHash       String   @unique
  expiresAt       DateTime
  reauthenticatedAt DateTime?
  createdAt       DateTime @default(now())
  lastSeenAt      DateTime @default(now())
  member          Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  @@index([memberId, expiresAt])
}

model UserProfile {
  id                 String      @id @default(cuid())
  externalUserId     String      @unique
  email              String
  emailNormalized    String
  displayName        String?
  registeredAt       DateTime
  registrationIpEnc  String?
  registrationIpHash String?
  countryCode        String?
  region             String?
  language           String?
  timezone           String?
  source             String?
  checkoutStartedAt  DateTime?
  paymentStatus      String      @default("NONE")
  firstPaidAt        DateTime?
  totalPaidMinor     Int         @default(0)
  firstCallAt        DateTime?
  lastCallAt         DateTime?
  successfulCallCount Int        @default(0)
  balanceMinor       Int         @default(0)
  balanceChangedAt   DateTime?
  anomalyActive      Boolean     @default(false)
  currentSegment     SegmentCode
  segmentRuleVersion Int         @default(1)
  ownerId            String?
  reasonLabel        String?
  unsubscribedAt     DateTime?
  pausedAt           DateTime?
  lastExternalEventAt DateTime?
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  events             UserEvent[]
  segmentHistory     SegmentHistory[]
  tasks              RecallTask[]
  notes              UserNote[]
  segmentOverrides   SegmentOverride[]
  owner              Member?     @relation("UserOwner", fields: [ownerId], references: [id])
  @@index([currentSegment, updatedAt])
  @@index([countryCode, region])
  @@index([emailNormalized])
}

model UserEvent {
  id          String   @id @default(cuid())
  eventId     String   @unique
  userId      String
  eventType   String
  occurredAt  DateTime
  receivedAt  DateTime @default(now())
  payload     Json
  applied     Boolean  @default(false)
  errorCode   String?
  user        UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, occurredAt])
}

model SegmentHistory {
  id            String      @id @default(cuid())
  userId        String
  fromSegment   SegmentCode?
  toSegment     SegmentCode
  ruleVersion   Int
  reason        String
  changedAt     DateTime    @default(now())
  user          UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, changedAt])
}

model SegmentOverride {
  id          String      @id @default(cuid())
  userId      String
  segment     SegmentCode
  reason      String
  createdById String
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime    @default(now())
  user        UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, expiresAt])
}

model UserNote {
  id        String      @id @default(cuid())
  userId    String
  authorId  String
  body      String
  createdAt DateTime    @default(now())
  user      UserProfile @relation(fields: [userId], references: [id], onDelete: Cascade)
  author    Member      @relation(fields: [authorId], references: [id])
  @@index([userId, createdAt])
}

model AutomationRuleVersion {
  id          String   @id @default(cuid())
  kind        String
  version     Int
  config      Json
  active      Boolean  @default(false)
  createdById String
  createdAt   DateTime @default(now())
  @@unique([kind, version])
  @@index([kind, active])
}

model RecallTask {
  id            String       @id @default(cuid())
  userId        String
  origin        TaskOrigin
  triggerKey    String
  ruleVersion   Int
  title         String
  reason        String
  priority      TaskPriority
  status        TaskStatus   @default(UNASSIGNED)
  assigneeId    String?
  assignmentReason String?
  dueAt         DateTime
  startedAt     DateTime?
  completedAt   DateTime?
  cancelledAt   DateTime?
  cancelReason  String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  user          UserProfile  @relation(fields: [userId], references: [id], onDelete: Cascade)
  assignee      Member?      @relation("TaskAssignee", fields: [assigneeId], references: [id])
  activities    TaskActivity[]
  @@unique([userId, triggerKey, ruleVersion])
  @@index([status, priority, dueAt])
  @@index([assigneeId, status])
}

model TaskActivity {
  id          String   @id @default(cuid())
  taskId      String
  actorId     String?
  action      String
  detail      Json?
  createdAt   DateTime @default(now())
  task        RecallTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  @@index([taskId, createdAt])
}

model AuditLog {
  id          String   @id @default(cuid())
  actorId     String?
  action      String
  entityType  String
  entityId    String?
  metadata    Json
  ipHash      String?
  createdAt   DateTime @default(now())
  actor       Member?  @relation("AuditActor", fields: [actorId], references: [id])
  @@index([createdAt])
  @@index([entityType, entityId])
}
```

- [ ] **Step 5: Configure Prisma 7 and the database singleton**

Create `prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") }
});
```

Create `src/lib/db/prisma.ts` using `@prisma/adapter-pg` and one development singleton. Export `prisma`.

- [ ] **Step 6: Start PostgreSQL and run the first migration**

Add a `db` service to `compose.yaml` using `postgres:16-bookworm`, database `righttoken_recall`, a named volume, and a health check.

Run:

```bash
docker compose up -d db
npx prisma validate
npx prisma migrate dev --name core_domain
npx prisma generate
```

Expected: migration succeeds and Prisma Client is generated in `src/generated/prisma`.

- [ ] **Step 7: Seed only synthetic users and exactly one primary admin**

Create `prisma/seed.ts` that:

- reads `SEED_PRIMARY_ADMIN_EMAIL` and `SEED_PRIMARY_ADMIN_PASSWORD`;
- hashes the password with Argon2id;
- refuses to create a second `PRIMARY_ADMIN`;
- creates synthetic users named `demo-a@example.test` through `demo-g@example.test`;
- never imports the 67 real emails embedded in the legacy HTML.

Core guard:

```ts
const existingPrimary = await prisma.member.count({ where: { role: "PRIMARY_ADMIN" } });
if (existingPrimary > 1) throw new Error("database contains more than one primary admin");
```

- [ ] **Step 8: Write and run schema invariants**

Create `tests/integration/db/schema.test.ts` verifying:

```ts
expect(await prisma.member.count({ where: { role: "PRIMARY_ADMIN" } })).toBe(1);
await expect(
  prisma.userEvent.create({
    data: {
      eventId: "duplicate-event",
      eventType: "user.registered",
      occurredAt: new Date(),
      payload: {},
      userId
    }
  }).then(() =>
    prisma.userEvent.create({
      data: {
        eventId: "duplicate-event",
        eventType: "user.registered",
        occurredAt: new Date(),
        payload: {},
        userId
      }
    })
  )
).rejects.toThrow();
```

Run:

```bash
npm run db:seed
npm run test:integration -- tests/integration/db/schema.test.ts
npm test -- tests/unit/crypto/field-encryption.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the data foundation**

```bash
git add prisma prisma.config.ts compose.yaml src/generated src/lib/db src/lib/crypto tests/integration/db tests/unit/crypto
git commit -m "feat: add core database and safe seed data"
```

---

### Task 3: Password Sessions and Role-Based Access Control

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `add_login_attempts`
- Create: `src/modules/auth/permissions.ts`
- Create: `src/modules/auth/password.ts`
- Create: `src/modules/auth/session.ts`
- Create: `src/modules/auth/guards.ts`
- Create: `src/modules/auth/login-rate-limit.ts`
- Create: `src/modules/auth/csrf.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/proxy.ts`
- Test: `tests/unit/auth/permissions.test.ts`
- Test: `tests/integration/auth/session.test.ts`

**Interfaces:**
- Produces: `Permission` union and `can(role, permission): boolean`.
- Produces: `createSession(memberId)`, `getCurrentMember()`, `revokeSession()`.
- Produces: `requirePermission(permission)` for every server mutation and export.

- [ ] **Step 1: Write the permission matrix tests**

Create `tests/unit/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can } from "@/modules/auth/permissions";

describe("role permissions", () => {
  it("allows only the primary admin to export CSV", () => {
    expect(can("PRIMARY_ADMIN", "users:export")).toBe(true);
    expect(can("ADMIN", "users:export")).toBe(false);
    expect(can("OPERATOR", "users:export")).toBe(false);
  });

  it("allows admins to manage operators but not admins", () => {
    expect(can("ADMIN", "operators:manage")).toBe(true);
    expect(can("ADMIN", "admins:manage")).toBe(false);
  });

  it("allows operators to work assigned tasks and send reviewed mail", () => {
    expect(can("OPERATOR", "tasks:work")).toBe(true);
    expect(can("OPERATOR", "mail:send-reviewed")).toBe(true);
    expect(can("OPERATOR", "rules:publish")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the permission test to verify it fails**

Run:

```bash
npm test -- tests/unit/auth/permissions.test.ts
```

Expected: FAIL because `permissions.ts` does not exist.

- [ ] **Step 3: Implement the explicit permission matrix**

Create `src/modules/auth/permissions.ts`:

```ts
export type Role = "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";
export type Permission =
  | "users:read"
  | "users:reveal-sensitive"
  | "users:import"
  | "users:export"
  | "tasks:work"
  | "mail:send-reviewed"
  | "rules:publish"
  | "operators:manage"
  | "admins:manage"
  | "integrations:manage"
  | "audit:read";

const permissions: Record<Role, ReadonlySet<Permission>> = {
  PRIMARY_ADMIN: new Set([
    "users:read", "users:reveal-sensitive", "users:import", "users:export", "tasks:work",
    "mail:send-reviewed", "rules:publish", "operators:manage",
    "admins:manage", "integrations:manage", "audit:read"
  ]),
  ADMIN: new Set([
    "users:read", "users:reveal-sensitive", "users:import", "tasks:work", "mail:send-reviewed",
    "rules:publish", "operators:manage", "integrations:manage", "audit:read"
  ]),
  OPERATOR: new Set(["users:read", "tasks:work", "mail:send-reviewed"])
};

export function can(role: Role, permission: Permission): boolean {
  return permissions[role].has(permission);
}
```

- [ ] **Step 4: Write a failing session lifecycle integration test**

Create `tests/integration/auth/session.test.ts` that creates a member, calls `createSession`, verifies the stored token is hashed rather than plaintext, resolves the member through the cookie token, revokes it, and verifies it no longer resolves.

Expected assertion:

```ts
expect(stored.tokenHash).not.toBe(session.token);
expect((await findMemberBySessionToken(session.token))?.id).toBe(member.id);
await revokeSessionByToken(session.token);
expect(await findMemberBySessionToken(session.token)).toBeNull();
```

- [ ] **Step 5: Implement password and opaque session services**

Implement:

```ts
export async function hashPassword(password: string): Promise<string>;
export async function verifyPassword(hash: string, password: string): Promise<boolean>;
export async function createSession(memberId: string): Promise<{ token: string; expiresAt: Date }>;
export async function findMemberBySessionToken(token: string): Promise<Member | null>;
export async function markReauthenticated(sessionId: string): Promise<void>;
export async function revokeSessionByToken(token: string): Promise<void>;
export async function listMemberSessions(memberId: string): Promise<SessionSummary[]>;
export async function revokeAllMemberSessions(memberId: string, exceptSessionId?: string): Promise<number>;
```

Use 32 random bytes for the browser token, SHA-256 for the database token hash, a 12-hour session expiry, and an HTTP-only cookie named `rt_recall_session` with `Secure`, `SameSite=Lax`, and path `/`.

- [ ] **Step 6: Add persistent login rate limiting and same-origin mutation checks**

Add:

```prisma
model LoginAttempt {
  id        String   @id @default(cuid())
  emailHash String
  ipHash    String
  succeeded Boolean
  createdAt DateTime @default(now())
  @@index([emailHash, ipHash, createdAt])
}
```

Run migration `add_login_attempts`. Before password verification, count failures for the same email hash or IP hash in the previous 15 minutes; after five failures return `LOGIN_RATE_LIMITED` until the window expires. Record success/failure without storing plaintext email or IP.

`assertSameOrigin(request)` must compare the `Origin` host with `APP_URL` for every cookie-authenticated POST/PATCH/PUT/DELETE route.

- [ ] **Step 7: Add login, logout, route protection, and server guards**

Login request schema:

```ts
const loginSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12)
});
```

`src/proxy.ts` only redirects anonymous browser navigation. Every route handler and server action must call `requirePermission`; proxy checks never replace server authorization.

- [ ] **Step 8: Run auth verification**

Run:

```bash
npm test -- tests/unit/auth/permissions.test.ts
npm run test:integration -- tests/integration/auth/session.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit authentication and RBAC**

```bash
git add prisma src/modules/auth src/app/api/auth src/app/'(auth)' src/proxy.ts tests/unit/auth tests/integration/auth
git commit -m "feat: add secure sessions and role permissions"
```

---

### Task 4: Invitations, Two-Factor Authentication, and Primary Admin Invariant

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `add_invites_and_two_factor`
- Create: `src/modules/auth/invitations.ts`
- Create: `src/modules/auth/two-factor.ts`
- Create: `src/modules/auth/primary-admin.ts`
- Create: `src/app/api/auth/2fa/setup/route.ts`
- Create: `src/app/api/auth/2fa/verify/route.ts`
- Create: `src/app/api/auth/reauthenticate/route.ts`
- Create: `src/app/api/members/invitations/route.ts`
- Create: `src/app/api/members/primary-transfer/route.ts`
- Test: `tests/unit/auth/two-factor.test.ts`
- Test: `tests/integration/auth/primary-admin.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requirePermission`, field encryption.
- Produces: `createInvitation`, `acceptInvitation`, `beginTwoFactorSetup`, `confirmTwoFactorSetup`, `verifySecondFactor`, `transferPrimaryAdmin`.

- [ ] **Step 1: Add invitation and recovery-code models**

Add:

```prisma
model Invitation {
  id          String     @id @default(cuid())
  email       String
  role        MemberRole
  tokenHash   String     @unique
  invitedById String
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime   @default(now())
  @@index([email, expiresAt])
}

model RecoveryCode {
  id        String   @id @default(cuid())
  memberId  String
  codeHash  String
  usedAt    DateTime?
  createdAt DateTime @default(now())
  member    Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  @@index([memberId, usedAt])
}
```

Add `recoveryCodes RecoveryCode[]` to `Member`, then run:

```bash
npx prisma migrate dev --name add_invites_and_two_factor
npx prisma generate
```

- [ ] **Step 2: Write failing TOTP tests**

Create `tests/unit/auth/two-factor.test.ts`:

```ts
it("accepts a current TOTP and rejects reuse outside the allowed window", async () => {
  const setup = await createTwoFactorMaterial("admin@example.test");
  const code = await setup.totp.generate();
  expect(await verifyTotp(setup.secret, code)).toBe(true);
  expect(await verifyTotp(setup.secret, "000000")).toBe(false);
});

it("stores only hashes of recovery codes", async () => {
  const result = await createRecoveryCodes();
  expect(result.hashes).toHaveLength(10);
  expect(result.hashes.join(" ")).not.toContain(result.plaintext[0]);
});
```

- [ ] **Step 3: Implement TOTP setup and recovery codes**

Use `otplib` for a 30-second, 6-digit TOTP. Encrypt the TOTP secret before storing it. Generate ten one-time recovery codes, return plaintext only once, and store Argon2id hashes.

Required signatures:

```ts
export async function beginTwoFactorSetup(memberId: string): Promise<{
  otpauthUrl: string;
  qrDataUrl: string;
  pendingSecretToken: string;
}>;
export async function confirmTwoFactorSetup(
  memberId: string,
  pendingSecretToken: string,
  code: string
): Promise<{ recoveryCodes: string[] }>;
export async function verifySecondFactor(memberId: string, code: string): Promise<boolean>;
```

- [ ] **Step 4: Write the primary-admin transfer integration test**

The test must prove:

```ts
expect(await countPrimaryAdmins()).toBe(1);
await transferPrimaryAdmin(currentPrimary.id, targetAdmin.id, verifiedSession.id);
expect(await countPrimaryAdmins()).toBe(1);
expect((await prisma.member.findUniqueOrThrow({ where: { id: currentPrimary.id } })).role).toBe("ADMIN");
expect((await prisma.member.findUniqueOrThrow({ where: { id: targetAdmin.id } })).role).toBe("PRIMARY_ADMIN");
```

Also verify an `ADMIN` caller receives `ForbiddenError`.

- [ ] **Step 5: Implement invitations and atomic primary transfer**

`createInvitation` rules:

- primary admin may invite `ADMIN` or `OPERATOR`;
- admin may invite only `OPERATOR`;
- operator may not invite;
- tokens expire after 48 hours and are stored as SHA-256 hashes.

`transferPrimaryAdmin` must run a serializable database transaction, lock the two member rows, verify recent reauthentication within 5 minutes, promote the target, demote the caller, and write one audit record containing both member IDs.

- [ ] **Step 6: Add route handlers and reauthentication checks**

All privileged handlers return:

```json
{ "error": { "code": "REAUTH_REQUIRED", "message": "请重新验证后继续" } }
```

when `reauthenticatedAt` is older than 5 minutes.

The login flow must force `PRIMARY_ADMIN` and any administrator covered by the current security policy to finish TOTP enrollment before entering dashboard routes. `/api/auth/reauthenticate` verifies password plus TOTP when enabled, then calls `markReauthenticated`.

- [ ] **Step 7: Run two-factor and role-invariant verification**

Run:

```bash
npm test -- tests/unit/auth/two-factor.test.ts
npm run test:integration -- tests/integration/auth/primary-admin.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit invitation and 2FA support**

```bash
git add prisma src/modules/auth src/app/api/auth/2fa src/app/api/members tests/unit/auth tests/integration/auth
git commit -m "feat: add invitations two-factor and primary admin transfer"
```

---

### Task 5: User Events and the A–G Segmentation Engine

**Files:**
- Create: `src/modules/users/event-types.ts`
- Create: `src/modules/users/event-schema.ts`
- Create: `src/modules/users/apply-event.ts`
- Create: `src/modules/users/user-repository.ts`
- Create: `src/modules/segmentation/types.ts`
- Create: `src/modules/segmentation/classify-user.ts`
- Create: `src/modules/segmentation/rule-config.ts`
- Create: `src/modules/segmentation/resegment-user.ts`
- Create: `src/modules/segmentation/segment-override.ts`
- Create: `src/modules/automation/rule-version.ts`
- Test: `tests/unit/segmentation/classify-user.test.ts`
- Test: `tests/integration/users/ingest-event.test.ts`

**Interfaces:**
- Produces: `classifyUser(facts, now, config): SegmentDecision`.
- Produces: `ingestUserEvent(input): Promise<IngestResult>`.
- Produces: `resegmentUser(tx, user, reason): Promise<SegmentChange | null>`.
- Produces: audited, expiring `createSegmentOverride` and `revokeSegmentOverride`.
- Produces: `getActiveAutomationRule(kind)` and atomic `publishAutomationRule(kind, config, actorId)`.
- Produces the event service consumed by the future endpoint in Task 16.

- [ ] **Step 1: Write the complete A–G decision table as failing tests**

Create `tests/unit/segmentation/classify-user.test.ts` with one case per group:

```ts
const now = new Date("2026-07-23T12:00:00.000Z");
const base = {
  registeredAt: new Date("2026-07-20T00:00:00.000Z"),
  checkoutStartedAt: null,
  firstPaidAt: null,
  successfulCallCount: 0,
  lastCallAt: null,
  balanceMinor: 0,
  anomalyActive: false
};

it.each([
  [{ ...base }, "A"],
  [{ ...base, checkoutStartedAt: new Date("2026-07-23T10:00:00Z") }, "B"],
  [{ ...base, firstPaidAt: new Date("2026-07-22T10:00:00Z") }, "C"],
  [{ ...base, firstPaidAt: now, successfulCallCount: 2, lastCallAt: new Date("2026-07-10T00:00:00Z"), balanceMinor: 500 }, "D"],
  [{ ...base, firstPaidAt: now, successfulCallCount: 2, lastCallAt: now, balanceMinor: 0 }, "E"],
  [{ ...base, anomalyActive: true }, "F"],
  [{ ...base, firstPaidAt: now, successfulCallCount: 2, lastCallAt: now, balanceMinor: 500 }, "G"]
])("classifies facts as %s", (facts, expected) => {
  expect(classifyUser(facts, now, defaultSegmentConfig).segment).toBe(expected);
});
```

Add a precedence test proving F overrides every other condition.

- [ ] **Step 2: Run the segmentation tests to verify they fail**

Run:

```bash
npm test -- tests/unit/segmentation/classify-user.test.ts
```

Expected: FAIL because the segmentation module does not exist.

- [ ] **Step 3: Implement a pure segmentation function**

Create:

```ts
export type SegmentFacts = {
  registeredAt: Date;
  checkoutStartedAt: Date | null;
  firstPaidAt: Date | null;
  successfulCallCount: number;
  lastCallAt: Date | null;
  balanceMinor: number;
  anomalyActive: boolean;
};

export type SegmentDecision = {
  segment: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  reason: string;
};
```

Implement exact precedence:

```ts
if (facts.anomalyActive) return { segment: "F", reason: "active service anomaly" };
if (!facts.firstPaidAt) {
  return facts.checkoutStartedAt
    ? { segment: "B", reason: "checkout started without first payment" }
    : { segment: "A", reason: "registered without checkout or first payment" };
}
if (facts.successfulCallCount === 0) return { segment: "C", reason: "paid without successful call" };
if (facts.balanceMinor <= config.emptyBalanceMinor) return { segment: "E", reason: "balance exhausted" };
if (!facts.lastCallAt || now.getTime() - facts.lastCallAt.getTime() >= config.inactiveMs) {
  return { segment: "D", reason: "inactive with positive balance" };
}
return { segment: "G", reason: "healthy active user" };
```

`resegmentUser` applies an active, unexpired manual override only after checking F. A live service anomaly always remains F. Override creation/revocation requires an administrator, a reason, an expiry no later than 30 days, and an audit record. Expired overrides are ignored automatically.

`publishAutomationRule` deactivates the previous version and activates the incremented version in one serializable transaction. Segmentation stores the exact active version on the user and task.

- [ ] **Step 4: Define and validate the external event contract**

Use a discriminated Zod union for:

```ts
type RightTokenEventType =
  | "user.registered"
  | "checkout.started"
  | "checkout.cancelled"
  | "checkout.expired"
  | "payment.failed"
  | "payment.succeeded"
  | "balance.changed"
  | "api_call.succeeded"
  | "service.anomaly"
  | "service.recovered"
  | "complaint.created"
  | "refund.requested"
  | "user.profile_updated";
```

Every event contains `event_id`, `event_type`, ISO `occurred_at`, `user_id`, and typed `payload`. Reject unknown payload properties at the route boundary.

- [ ] **Step 5: Write failing event-ingestion integration tests**

Tests must cover:

1. duplicate `event_id` returns `{ duplicate: true }`;
2. old `balance.changed` is stored but does not overwrite a newer balance;
3. `payment.succeeded` changes B → C and writes `SegmentHistory`;
4. `api_call.succeeded` changes C → G.

Representative assertion:

```ts
const result = await ingestUserEvent(paymentSucceeded);
expect(result).toMatchObject({ duplicate: false, previousSegment: "B", currentSegment: "C" });
expect(await prisma.segmentHistory.count({ where: { userId } })).toBe(1);
```

- [ ] **Step 6: Implement idempotent ingestion and resegmentation**

`ingestUserEvent` must run in one transaction:

- create `UserEvent` by unique `eventId`;
- upsert the user for `user.registered`;
- store stale events with `applied=false`;
- update only facts whose event timestamp is not older than the current fact;
- set `anomalyActive=true` for service anomaly, complaint, and refund-request events, and set it back to `false` only for an explicit `service.recovered` event;
- run `resegmentUser`;
- mark the event `applied=true`;
- return previous/current segment and change metadata.

- [ ] **Step 7: Add an adapter-facing event service contract**

Export:

```ts
export interface UserEventIngestionService {
  ingest(input: RightTokenEventInput): Promise<{
    accepted: true;
    duplicate: boolean;
    previousSegment: SegmentCode | null;
    currentSegment: SegmentCode;
  }>;
}
```

Task 16 exposes this service through the future RightToken endpoint after encrypted integration credentials exist. Do not add a production RightToken credential to `.env.example`.

- [ ] **Step 8: Verify and commit segmentation**

Run:

```bash
npm test -- tests/unit/segmentation
npm run test:integration -- tests/integration/users/ingest-event.test.ts
npm run typecheck
```

Then:

```bash
git add src/modules/users src/modules/segmentation src/modules/automation tests/unit/segmentation tests/integration/users
git commit -m "feat: add event ingestion and automatic segmentation"
```

---

### Task 6: Task Triggering, Lifecycle, and Idempotency

**Files:**
- Create: `src/modules/tasks/trigger-policy.ts`
- Create: `src/modules/tasks/create-triggered-task.ts`
- Create: `src/modules/tasks/task-service.ts`
- Create: `src/modules/tasks/close-obsolete-tasks.ts`
- Modify: `src/modules/segmentation/resegment-user.ts`
- Create: `tests/unit/tasks/trigger-policy.test.ts`
- Create: `tests/integration/tasks/task-lifecycle.test.ts`

**Interfaces:**
- Consumes: `SegmentDecision`, `UserProfile`, `RecallTask`.
- Produces: `getTriggerPolicy(segment): TriggerPolicy`.
- Produces: `createTriggeredTask(input): Promise<RecallTask>`.
- Produces: `claimTask`, `startTask`, `waitForUser`, `completeTask`, `pauseTask`, `cancelTask`, `transferTask`.

- [ ] **Step 1: Write failing default trigger-policy tests**

```ts
it.each([
  ["A", 2 * 60, "NORMAL"],
  ["B", 30, "IMPORTANT"],
  ["C", 24 * 60, "IMPORTANT"],
  ["D", 0, "NORMAL"],
  ["E", 3 * 24 * 60, "NORMAL"],
  ["F", 0, "URGENT"]
])("%s has the approved delay and priority", (segment, delayMinutes, priority) => {
  expect(getTriggerPolicy(segment)).toMatchObject({ delayMinutes, priority });
});

it("does not create personal recall tasks for G", () => {
  expect(getTriggerPolicy("G").enabled).toBe(false);
});
```

- [ ] **Step 2: Implement the typed default trigger policy**

```ts
export type TriggerPolicy = {
  enabled: boolean;
  delayMinutes: number;
  priority: "URGENT" | "IMPORTANT" | "NORMAL";
  dueMinutesAfterCreation: number;
  templateKey: string | null;
};
```

Use due times: F 30 minutes, B/C 120 minutes, A/D/E one working day.

`D` 的 7 天是“进入 D 分组”的时间边界，不是进入 D 后再等待 7 天。用户每次成功调用时都要安排一次 `lastCallAt + 7 天` 的时间边界复算；用户真正进入 D 后立即创建普通任务。

- [ ] **Step 3: Write failing lifecycle and idempotency integration tests**

Cover:

- duplicate segment checks create one task;
- B → C cancels an open B automation task with `cancelReason="segment_changed"`;
- manual tasks are not auto-cancelled;
- invalid transition `COMPLETED → IN_PROGRESS` is rejected;
- operator transfer writes `TaskActivity`.

- [ ] **Step 4: Implement the task state machine**

Allowed transitions:

```ts
const allowedTransitions = {
  UNASSIGNED: ["TODO", "CANCELLED"],
  TODO: ["IN_PROGRESS", "PAUSED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_USER", "COMPLETED", "PAUSED", "CANCELLED"],
  WAITING_USER: ["IN_PROGRESS", "COMPLETED", "PAUSED", "CANCELLED"],
  PAUSED: ["TODO", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
} as const;
```

Every transition updates timestamps and creates `TaskActivity` in the same transaction.

- [ ] **Step 5: Implement automatic task uniqueness and obsolete-task closure**

Trigger key format:

```ts
`${segment}:${policyKey}:${windowStart.toISOString()}`
```

Use the database unique constraint `[userId, triggerKey, ruleVersion]`; treat unique conflicts as the existing task rather than an error.

On segment change, cancel only tasks with `origin=AUTOMATION`, open status, and a trigger key tied to the old segment.

- [ ] **Step 6: Connect segmentation changes to delayed checks**

`resegmentUser` returns a domain event:

```ts
type SegmentChanged = {
  userId: string;
  from: SegmentCode | null;
  to: SegmentCode;
  changedAt: Date;
  ruleVersion: number;
};
```

Pass it to this `TaskScheduler` interface; Task 8 supplies the pg-boss implementation and tests use an in-memory spy:

```ts
export type SegmentCheckSchedule = {
  userId: string;
  expectedSegment: SegmentCode;
  expectedFactTimestamp: string;
  runAt: Date;
  reasonKey: string;
};

export interface TaskScheduler {
  scheduleSegmentCheck(input: SegmentCheckSchedule): Promise<void>;
}
```

In addition, every applied event must call:

```ts
export function getNextTemporalBoundary(
  facts: SegmentFacts,
  now: Date,
  config: SegmentConfig
): { runAt: Date; expectedSegment: SegmentCode; reasonKey: string } | null;
```

For active G users this returns `lastCallAt + 7 days`; a newer successful call schedules a new singleton key and makes the older boundary job exit because its expected timestamp no longer matches.

The same function returns:

- A: `registeredAt + 2 hours`;
- B: `checkoutStartedAt + 30 minutes`;
- C: `firstPaidAt + 24 hours`;
- D: immediately after the G → D boundary transition;
- E: `balanceChangedAt + 3 days`;
- F: immediately;
- G: `lastCallAt + 7 days` for resegmentation only, with no G task.

- [ ] **Step 7: Verify and commit task lifecycle**

```bash
npm test -- tests/unit/tasks
npm run test:integration -- tests/integration/tasks/task-lifecycle.test.ts
git add src/modules/tasks src/modules/segmentation tests/unit/tasks tests/integration/tasks
git commit -m "feat: add idempotent recall task lifecycle"
```

---

### Task 7: Configurable Geographic Assignment Rules

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `add_assignment_rules`
- Create: `src/modules/assignment/types.ts`
- Create: `src/modules/assignment/match-rule.ts`
- Create: `src/modules/assignment/assign-task.ts`
- Create: `src/modules/assignment/preview-rules.ts`
- Create: `src/app/api/automation/assignment-rules/route.ts`
- Create: `src/app/api/automation/assignment-rules/preview/route.ts`
- Test: `tests/unit/assignment/match-rule.test.ts`
- Test: `tests/integration/assignment/assign-task.test.ts`

**Interfaces:**
- Produces: `AssignmentCondition`, `AssignmentRuleInput`.
- Produces: `matchRule(userContext, rules, workload): AssignmentDecision`.
- Produces: `assignTask(taskId): Promise<AssignmentDecision>`.

- [ ] **Step 1: Add assignment-rule persistence**

Add:

```prisma
model AssignmentRule {
  id                 String   @id @default(cuid())
  name               String
  enabled            Boolean  @default(true)
  priority           Int
  conditions         Json
  assigneeId         String?
  fallbackAssigneeId String?
  poolKey            String?
  workloadLimit      Int?
  effectiveFrom      DateTime?
  effectiveTo        DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@unique([priority])
  @@index([enabled, priority])
}
```

Run migration and generation.

- [ ] **Step 2: Write failing ordered-rule tests**

```ts
const rules = [
  rule(10, { countryCodes: ["US"], segments: ["B"] }, "us-operator"),
  rule(20, { regionIncludes: ["广东"] }, "south-operator"),
  rule(999, {}, null, "public")
];

expect(matchRule(user({ countryCode: "US", segment: "B" }), rules, workload()))
  .toMatchObject({ assigneeId: "us-operator", matchedRulePriority: 10 });
expect(matchRule(user({ countryCode: "CN", region: "广东省" }), rules, workload()))
  .toMatchObject({ assigneeId: "south-operator", matchedRulePriority: 20 });
```

Add tests for IP CIDR, language, timezone, source, value range, work hours, overload fallback, and public pool fallback.

- [ ] **Step 3: Implement deterministic matching**

Conditions schema:

```ts
const conditionSchema = z.object({
  countryCodes: z.array(z.string().length(2)).optional(),
  regionIncludes: z.array(z.string().min(1)).optional(),
  ipCidrs: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  timezones: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  segments: z.array(z.enum(["A", "B", "C", "D", "E", "F", "G"])).optional(),
  minTotalPaidMinor: z.number().int().min(0).optional(),
  maxTotalPaidMinor: z.number().int().min(0).optional()
}).strict();
```

Sort enabled rules by ascending priority; the first full match wins. If the assignee is inactive, outside work hours, or above `workloadLimit`, use the configured fallback; otherwise use the public pool.

- [ ] **Step 4: Write and implement the assignment integration test**

The integration test creates users in US and Guangdong, two operators with different workload, and rules. It verifies assigned IDs and exact `assignmentReason`.

`assignmentReason` example:

```text
规则“美国 B 组”命中：国家=US，分组=B；负责人当前未完成任务 6/20
```

- [ ] **Step 5: Implement preview without writes**

`previewRules` accepts an unsaved ruleset, samples the most recent 500 users, and returns counts by rule, assignee, public pool, and unmatched condition. It must not create tasks or alter owners.

- [ ] **Step 6: Add administrator-only APIs and audit**

Admins and primary admin may create, reorder, enable, disable, and preview rules. Publishing rules validates unique priorities, active targets, valid CIDRs, and writes an audit log with before/after JSON.

- [ ] **Step 7: Verify and commit assignment**

```bash
npm test -- tests/unit/assignment
npm run test:integration -- tests/integration/assignment
git add prisma src/modules/assignment src/app/api/automation/assignment-rules tests/unit/assignment tests/integration/assignment
git commit -m "feat: add configurable geographic assignment rules"
```

---

### Task 8: PostgreSQL Job Queue and Worker Runtime

**Files:**
- Create: `src/worker/index.ts`
- Create: `src/worker/boss.ts`
- Create: `src/worker/job-names.ts`
- Create: `src/worker/register-handlers.ts`
- Create: `src/modules/tasks/pg-task-scheduler.ts`
- Create: `src/worker/handlers/segment-check.ts`
- Create: `src/worker/handlers/sla-escalation.ts`
- Create: `src/worker/handlers/daily-digest.ts`
- Test: `tests/integration/worker/segment-check.test.ts`
- Test: `tests/integration/worker/job-idempotency.test.ts`

**Interfaces:**
- Consumes: `TaskScheduler`, trigger policies, task service.
- Produces: `boss`, `startWorker()`, `stopWorker()`.
- Produces jobs `segment-check`, `sla-escalation`, `daily-digest`, `pii-retention`, later `mail-sync` and `reconcile-users`.

- [ ] **Step 1: Write a failing delayed-segment-check test**

The test schedules an A check at `registeredAt + 2h`, advances the clock, executes the handler twice, and expects one task:

```ts
expect(await prisma.recallTask.count({
  where: { userId, triggerKey: { startsWith: "A:" } }
})).toBe(1);
```

- [ ] **Step 2: Implement the pg-boss connection and stable job names**

```ts
export const JOBS = {
  SEGMENT_CHECK: "segment-check",
  SLA_ESCALATION: "sla-escalation",
  DAILY_DIGEST: "daily-digest",
  PII_RETENTION: "pii-retention",
  MAIL_SYNC: "mail-sync",
  USER_RECONCILIATION: "user-reconciliation"
} as const;
```

Configure pg-boss to use `JOB_DATABASE_URL`, schema `pgboss`, application name `righttoken-recall-worker`, and graceful shutdown on `SIGTERM`/`SIGINT`.

- [ ] **Step 3: Implement `PgTaskScheduler`**

```ts
export class PgTaskScheduler implements TaskScheduler {
  async scheduleSegmentCheck(input: {
    userId: string;
    expectedSegment: SegmentCode;
    expectedFactTimestamp: string;
    runAt: Date;
    reasonKey: string;
  }) {
    await boss.send(
      JOBS.SEGMENT_CHECK,
      input,
      {
        startAfter: input.runAt,
        singletonKey: `${input.userId}:${input.reasonKey}:${input.expectedFactTimestamp}`
      }
    );
  }
}
```

- [ ] **Step 4: Implement safe job handlers**

`segment-check` reloads the user, verifies the expected fact timestamp, re-runs segmentation, and then evaluates task creation. If a newer fact invalidates the job it exits with `{ skipped: "state_changed" }`. This is how a G user becomes D exactly seven days after the latest successful call without waiting for the next full reconciliation.

`sla-escalation` finds due, incomplete tasks and emits notification intents without directly calling external services.

`daily-digest` runs at 10:00 Asia/Shanghai and aggregates normal tasks.

`pii-retention` runs daily at 03:00 Asia/Shanghai, clears `registrationIpEnc` for users registered more than 180 days ago, and retains only country, region, and the irreversible IP hash. It also deletes audit records only when they exceed the configured retention period, whose default is two years.

- [ ] **Step 5: Add worker startup and recurring schedules**

`src/worker/index.ts` validates server env, starts pg-boss, registers handlers, schedules SLA scan every 5 minutes, daily digest at 10:00, and PII retention at 03:00 Asia/Shanghai, then waits for shutdown.

- [ ] **Step 6: Verify restart safety**

Run the integration worker test twice with the same database. Expected:

- no duplicate jobs with the same singleton key;
- no duplicate recall tasks;
- unfinished jobs are processed after worker restart.

- [ ] **Step 7: Commit the worker runtime**

```bash
npm run test:integration -- tests/integration/worker
git add src/worker src/modules/tasks/pg-task-scheduler.ts tests/integration/worker
git commit -m "feat: add durable PostgreSQL worker jobs"
```

---

### Task 9: In-App, Enterprise WeChat, and Operator Email Notifications

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `add_notifications_and_integrations`
- Create: `src/modules/notifications/types.ts`
- Create: `src/modules/notifications/redact-notification.ts`
- Create: `src/modules/notifications/notification-service.ts`
- Create: `src/modules/notifications/adapters/in-app.ts`
- Create: `src/modules/notifications/adapters/wecom-webhook.ts`
- Create: `src/modules/notifications/adapters/operator-email.ts`
- Create: `src/modules/integrations/credential-store.ts`
- Create: `src/modules/integrations/email/smtp-sender.ts`
- Create: `src/app/api/notifications/route.ts`
- Test: `tests/unit/notifications/redact-notification.test.ts`
- Test: `tests/integration/notifications/delivery.test.ts`

**Interfaces:**
- Consumes: versioned `NOTIFICATION_POLICY` config from `src/modules/automation/rule-version.ts`.
- Produces: `NotificationIntent`, `NotificationAdapter`.
- Produces: `sendNotificationIntent(intentId)`.
- Produces encrypted `getIntegrationCredential(kind)` and `saveIntegrationCredential`.

- [ ] **Step 1: Add notification and encrypted integration models**

```prisma
enum NotificationChannel {
  IN_APP
  WECOM
  EMAIL
}

enum DeliveryStatus {
  PENDING
  SENT
  FAILED
  DEAD_LETTER
}

model NotificationIntent {
  id          String               @id @default(cuid())
  taskId      String?
  channel     NotificationChannel
  recipient   String
  payload     Json
  status      DeliveryStatus       @default(PENDING)
  attemptCount Int                 @default(0)
  lastErrorCode String?
  sentAt      DateTime?
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  @@index([status, createdAt])
}

model IntegrationCredential {
  id              String   @id @default(cuid())
  kind            String   @unique
  displayName     String
  encryptedConfig String
  enabled         Boolean  @default(false)
  lastTestedAt    DateTime?
  lastSuccessAt   DateTime?
  lastErrorCode   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Run migration and Prisma generation.

- [ ] **Step 2: Write failing redaction tests**

```ts
it("never places full email or IP into a WeCom message", () => {
  const payload = redactForNotification({
    externalUserId: "RT-1908",
    email: "person@example.com",
    registrationIp: "203.0.113.42",
    countryCode: "CN",
    region: "上海",
    segment: "F",
    reason: "连续调用失败"
  });
  expect(JSON.stringify(payload)).not.toContain("person@example.com");
  expect(JSON.stringify(payload)).not.toContain("203.0.113.42");
  expect(payload.summary).toContain("RT-1908");
  expect(payload.summary).toContain("上海");
});
```

- [ ] **Step 3: Define the adapter contract and redacted payload**

```ts
export interface NotificationAdapter {
  channel: "IN_APP" | "WECOM" | "EMAIL";
  send(input: {
    recipient: string;
    title: string;
    summary: string;
    taskUrl: string;
  }): Promise<{ providerMessageId?: string }>;
}
```

Only include external user ID, country/region, segment, trigger reason, remaining SLA, and task URL.

- [ ] **Step 4: Implement encrypted credential storage**

`saveIntegrationCredential` requires `integrations:manage`, encrypts the entire JSON config with field encryption, returns only display name/status, and writes an audit entry. `getIntegrationCredential` is server-only and never serializes the decrypted config into a route response.

- [ ] **Step 5: Implement the three notification adapters**

- In-app: persist a `SENT` intent immediately and expose unread notifications to the current member.
- WeCom: POST markdown to the configured group robot webhook; use a 5-second timeout and classify 429/5xx as retryable.
- Operator email: call the shared `sendSmtpMessage(config, message)` from `src/modules/integrations/email/smtp-sender.ts` and send only the redacted task summary. Task 10 reuses the same outbound function for reviewed user mail rather than creating a second SMTP implementation.

The WeCom markdown body:

```text
### [紧急] 服务异常待处理
用户：RT-1908（上海，F 组）
原因：连续调用失败
时限：剩余 7 分钟
[打开任务](https://recall.righttoken.ai/tasks/{taskId})
```

- [ ] **Step 6: Implement retry and dead-letter behavior**

Retry delays: 1 minute, 5 minutes, 20 minutes, 60 minutes. After four failed attempts set `DEAD_LETTER`, store only a stable error code, and create an in-app administrator alert.

- [ ] **Step 7: Verify channel delivery with fake adapters**

The integration test uses fake adapters to prove:

- urgent task creates three intents;
- important task creates in-app + WeCom initially;
- ordinary digest creates one WeCom summary;
- no payload contains full email or IP;
- retry increments `attemptCount` without duplicating intent rows.

- [ ] **Step 8: Commit notifications**

```bash
npm test -- tests/unit/notifications
npm run test:integration -- tests/integration/notifications
git add prisma src/modules/notifications src/modules/integrations src/app/api/notifications tests/unit/notifications tests/integration/notifications
git commit -m "feat: add redacted multichannel notifications"
```

---

### Task 10: Reviewed User Email, IMAP Reply Sync, and Suppression

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `add_mail_domain`
- Create: `src/modules/mail/types.ts`
- Create: `src/modules/mail/template-service.ts`
- Create: `src/modules/mail/send-guard.ts`
- Create: `src/modules/mail/send-reviewed-mail.ts`
- Create: `src/modules/mail/reply-matcher.ts`
- Create: `src/modules/mail/sync-mailbox.ts`
- Create: `src/modules/mail/adapters/smtp-imap.ts`
- Create: `src/modules/mail/tracking.ts`
- Create: `src/worker/handlers/mail-sync.ts`
- Create: `src/app/api/mail/drafts/route.ts`
- Create: `src/app/api/mail/send/route.ts`
- Create: `src/app/api/mail/unmatched/route.ts`
- Create: `src/app/api/mail/track/open/[token]/route.ts`
- Create: `src/app/api/mail/track/click/[token]/route.ts`
- Test: `tests/unit/mail/send-guard.test.ts`
- Test: `tests/unit/mail/reply-matcher.test.ts`
- Test: `tests/integration/mail/reviewed-send.test.ts`

**Interfaces:**
- Produces: `MailboxAdapter` with `testConnection`, `send`, `listMessagesSince`.
- Produces: `assertMailSendAllowed`, `sendReviewedMail`, `matchInboundReply`, `syncMailbox`.

- [ ] **Step 1: Add mail, template, suppression, and unmatched-message models**

Define:

```prisma
enum MailDirection {
  OUTBOUND
  INBOUND
}

enum MailMessageStatus {
  DRAFT
  SENT
  RECEIVED
  FAILED
  UNMATCHED
}

model Mailbox {
  id              String   @id @default(cuid())
  name            String
  emailAddress    String
  encryptedConfig String
  enabled         Boolean  @default(false)
  trackingEnabled Boolean  @default(false)
  trackingDisclosure String?
  lastSyncedAt    DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  threads         MailThread[]
}

model MailTemplate {
  id          String   @id @default(cuid())
  key         String
  version     Int
  name        String
  locale      String   @default("zh-CN")
  subject     String
  bodyText    String
  segment     SegmentCode?
  active      Boolean  @default(false)
  createdById String
  createdAt   DateTime @default(now())
  @@unique([key, version])
}

model MailThread {
  id          String   @id @default(cuid())
  userId      String
  mailboxId   String
  subject     String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  mailbox     Mailbox  @relation(fields: [mailboxId], references: [id])
  messages    MailMessage[]
  @@index([userId, updatedAt])
}

model MailMessage {
  id                String            @id @default(cuid())
  threadId          String?
  userId            String?
  taskId            String?
  direction         MailDirection
  status            MailMessageStatus
  providerMessageId String?
  inReplyTo         String?
  references        String[]
  fromAddress       String
  toAddresses       String[]
  subject           String
  bodyText          String
  templateKey       String?
  templateVersion   Int?
  reviewedById      String?
  openedAt          DateTime?
  firstClickedAt    DateTime?
  openCount         Int                @default(0)
  clickCount        Int                @default(0)
  sentAt            DateTime?
  receivedAt        DateTime?
  createdAt         DateTime          @default(now())
  thread            MailThread?       @relation(fields: [threadId], references: [id])
  @@index([providerMessageId])
  @@index([userId, createdAt])
}

model SuppressionEntry {
  id              String   @id @default(cuid())
  emailNormalized String   @unique
  reason          String
  source          String
  createdAt       DateTime @default(now())
}
```

Run migration and Prisma generation.

- [ ] **Step 2: Write failing send-guard tests**

Cover:

```ts
await expect(assertMailSendAllowed(unsubscribedUser, draft, now)).rejects.toMatchObject({
  code: "RECIPIENT_SUPPRESSED"
});
await expect(assertMailSendAllowed(user, draftWith("[称呼]"), now)).rejects.toMatchObject({
  code: "UNRESOLVED_TEMPLATE_VARIABLE"
});
await expect(assertMailSendAllowed(recentlyContactedUser, draft, now)).rejects.toMatchObject({
  code: "CONTACT_FREQUENCY_LIMIT"
});
```

Also reject mail without `reviewedById`.

- [ ] **Step 3: Implement reviewed-send guards and immutable sent content**

`sendReviewedMail` must:

1. require `mail:send-reviewed`;
2. verify the task belongs to or is visible to the operator;
3. run suppression, pause, frequency, duplicate, placeholder, sender, and review checks;
4. insert the final subject/body as a `DRAFT`;
5. call the mailbox adapter;
6. update the same message to `SENT` with provider ID and sent time;
7. add task activity and audit in a transaction after provider success.

It must never render a template after sending; the sent body is immutable.

- [ ] **Step 4: Implement the generic SMTP/IMAP adapter**

Configuration shape:

```ts
type SmtpImapConfig = {
  emailAddress: string;
  displayName: string;
  username: string;
  password: string;
  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number; secure: boolean };
};
```

Namecheap defaults are `mail.privateemail.com`, SMTP 465 SSL, IMAP 993 SSL. Enterprise WeChat fields remain administrator-configurable rather than hard-coded. The adapter imports the shared SMTP sender from Task 9 and adds only IMAP listing/parsing behavior.

- [ ] **Step 5: Write and implement reply-matching tests**

Matching order:

1. exact `In-Reply-To` provider message ID;
2. any exact `References` provider message ID;
3. normalized sender + recipient mailbox + subject stem within 30 days;
4. otherwise `UNMATCHED`.

The test must prove an ambiguous sender/subject match remains unmatched.

- [ ] **Step 6: Implement mailbox sync**

`syncMailbox` requests messages after `lastSyncedAt - 5 minutes`, deduplicates by provider message ID, stores the original received timestamp, matches the thread, creates an important `EMAIL_REPLY` task with a 4-hour SLA, and advances `lastSyncedAt` only after the batch commits.

- [ ] **Step 7: Implement optional, default-off open/click tracking**

Tracking is disabled by default. When an administrator enables it:

- generate a signed, expiring token containing only `messageId` and event type;
- append one open-pixel URL and rewrite approved HTTPS links through the click route;
- record first timestamp and increment count;
- never put email, user ID, or destination URL in the token;
- validate click destinations against the exact URL signed at send time;
- return a 1×1 transparent response for opens and 302 for valid clicks.

Tests must prove disabled templates contain no tracking URLs and forged/expired tokens do not update metrics.

- [ ] **Step 8: Register the mail-sync job**

Schedule one job per enabled mailbox every 2 minutes with singleton key `mailbox:{id}`. Connection or parsing failures use the shared retry/dead-letter mechanism.

- [ ] **Step 9: Verify and commit mail**

```bash
npm test -- tests/unit/mail
npm run test:integration -- tests/integration/mail/reviewed-send.test.ts
git add prisma src/modules/mail src/worker/handlers/mail-sync.ts src/app/api/mail tests/unit/mail tests/integration/mail
git commit -m "feat: add reviewed email and automatic reply sync"
```

---

### Task 11: CSV Import, Primary-Admin-Only Export, and Export Audit

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `add_export_audit`
- Create: `src/modules/imports/csv-schema.ts`
- Create: `src/modules/imports/import-users.ts`
- Create: `src/modules/imports/export-users.ts`
- Create: `src/modules/imports/export-token.ts`
- Create: `src/app/api/imports/users/route.ts`
- Create: `src/app/api/exports/users/route.ts`
- Create: `src/app/api/exports/users/[token]/route.ts`
- Test: `tests/unit/imports/csv-schema.test.ts`
- Test: `tests/integration/imports/export-permissions.test.ts`

**Interfaces:**
- Produces: `parseLegacyCsv`, `parseRightTokenCsv`, `importUsers`.
- Produces: `requestUserExport`, `downloadUserExport`.
- Enforces `users:export` and five-minute reauthentication exclusively on the server.

- [ ] **Step 1: Add an export audit model**

```prisma
model ExportAudit {
  id             String   @id @default(cuid())
  requestedById  String
  filters        Json
  fields         String[]
  recordCount    Int
  fileSha256     String
  downloadTokenHash String @unique
  tokenExpiresAt DateTime
  downloadedAt   DateTime?
  createdAt      DateTime @default(now())
  @@index([requestedById, createdAt])
}
```

Run migration and generation.

- [ ] **Step 2: Write failing CSV mapping tests**

Use synthetic fixtures only:

```csv
user_id,email,cancelled_count,expired_count,failed_count,last_order_at,last_amount,last_payment_type
demo-1,demo@example.test,1,2,0,2026-07-20T10:00:00Z,20,stripe
```

Assert it maps to external ID `demo-1`, normalized email, B group facts, and no real seed email.

- [ ] **Step 3: Implement standards-compliant CSV parsing**

Use `csv-parse/sync`; never split lines by commas. Validate headers, limit files to 10 MB and 20,000 rows, report row-level errors, and import valid rows in batches of 200.

Duplicate external IDs update only external fact fields and do not overwrite tasks, owners, mail, notes, or suppression.

- [ ] **Step 4: Write failing export-permission integration tests**

Test all roles:

```ts
await expect(requestUserExport(adminSession, request)).rejects.toMatchObject({ code: "FORBIDDEN" });
await expect(requestUserExport(operatorSession, request)).rejects.toMatchObject({ code: "FORBIDDEN" });
await expect(requestUserExport(stalePrimarySession, request)).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
const exportResult = await requestUserExport(freshPrimarySession, request);
expect(exportResult.downloadToken).toBeTruthy();
```

- [ ] **Step 5: Implement one-time export**

Generate CSV in a temporary server directory, hash it with SHA-256, save only the token hash, expire the token after 10 minutes, and mark it used after one successful download.

Do not include full IP or encrypted credentials in the allowed export fields. The default fields are external user ID, masked email, country/region, source, group, owner, task status, registration/payment/call timestamps, and reason label. The primary admin may explicitly select the full email field after reauthentication; this choice is stored in `ExportAudit.fields`.

- [ ] **Step 6: Verify auditing and one-time behavior**

Integration assertions:

- two downloads with the same token yield first 200, then 410;
- audit contains actor, filters, fields, record count, file hash;
- route UI visibility and direct API authorization agree.

- [ ] **Step 7: Commit imports and exports**

```bash
npm test -- tests/unit/imports
npm run test:integration -- tests/integration/imports
git add prisma src/modules/imports src/app/api/imports src/app/api/exports tests/unit/imports tests/integration/imports
git commit -m "feat: add audited CSV import and protected export"
```

---

### Task 12: Authenticated Shell and Operations Cockpit UI

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/components/layout/app-sidebar.tsx`
- Create: `src/components/layout/app-header.tsx`
- Create: `src/components/dashboard/metric-card.tsx`
- Create: `src/components/dashboard/priority-task-table.tsx`
- Create: `src/components/dashboard/segment-distribution.tsx`
- Create: `src/components/dashboard/channel-health.tsx`
- Create: `src/components/dashboard/team-workload.tsx`
- Create: `src/modules/reports/dashboard-query.ts`
- Test: `tests/unit/components/app-sidebar.test.tsx`
- Test: `tests/unit/components/dashboard.test.tsx`

**Interfaces:**
- Consumes: current member, dashboard query result.
- Produces: authenticated desktop-first shell matching the approved visual.
- Produces: `getDashboardSnapshot(member): Promise<DashboardSnapshot>`.

- [ ] **Step 1: Write failing navigation and role-visibility tests**

```tsx
render(<AppSidebar member={member("OPERATOR")} unreadTasks={28} unreadMail={17} />);
expect(screen.getByText("运营驾驶舱")).toBeInTheDocument();
expect(screen.getByText("任务中心")).toBeInTheDocument();
expect(screen.queryByText("成员与权限")).not.toBeInTheDocument();

render(<AppSidebar member={member("ADMIN")} unreadTasks={0} unreadMail={0} />);
expect(screen.getByText("分组规则")).toBeInTheDocument();
expect(screen.getByText("成员与权限")).toBeInTheDocument();
```

- [ ] **Step 2: Implement the exact navigation structure**

Navigation groups:

```ts
const navigation = [
  { label: "运营工作", items: ["运营驾驶舱", "任务中心", "用户中心", "邮件中心"] },
  { label: "自动化", items: ["分组规则", "分配规则", "通知策略"] },
  { label: "管理", items: ["数据报表", "成员与权限", "系统设置"] }
];
```

Use a deep navy sidebar, purple gradient `R` mark, white cards on a soft gray background, compact Chinese typography, and clear red/orange/purple priority colors.

- [ ] **Step 3: Write a failing dashboard-query test**

Seed tasks/users/messages and assert:

```ts
expect(snapshot.metrics).toMatchObject({
  dueToday: 28,
  urgent: 3,
  awaitingReply: 17
});
expect(snapshot.segmentDistribution).toHaveLength(7);
expect(snapshot.priorityTasks[0].priority).toBe("URGENT");
```

- [ ] **Step 4: Implement one read-optimized dashboard query**

Return:

```ts
type DashboardSnapshot = {
  metrics: {
    dueToday: number;
    overdue: number;
    urgent: number;
    awaitingReply: number;
    sevenDayRecallRate: number | null;
  };
  priorityTasks: DashboardTask[];
  segmentDistribution: Array<{ segment: SegmentCode; count: number }>;
  channelHealth: Array<{ channel: string; state: "healthy" | "warning" | "down" }>;
  teamWorkload: Array<{ memberId: string | null; name: string; openTasks: number; capacityPercent: number }>;
};
```

Scope operator data to assigned/public tasks; admins see the full team.

- [ ] **Step 5: Build the approved cockpit**

Render only product UI:

- greeting and date;
- four metrics: 今日待处理、紧急任务、用户待回复、7 日召回转化;
- SLA-sorted priority task table;
- A–G distribution;
- three channel health rows;
- operator/public-pool workload.

Do not render “A 方案展开”, design explanations, or the four module-description cards removed during visual review.

- [ ] **Step 6: Add responsive and accessibility behavior**

- Desktop: fixed 190 px sidebar.
- Tablet: collapsible icon sidebar.
- Mobile: show top alert count and task links; no dense charts.
- Use semantic landmarks, keyboard-visible focus, table headers, non-color priority labels, and `aria-current` on active navigation.

- [ ] **Step 7: Verify visual shell**

Run:

```bash
npm test -- tests/unit/components
npm run typecheck
npm run build
```

Expected: PASS and no design explanation text appears in built output.

- [ ] **Step 8: Commit the cockpit**

```bash
git add src/app/'(dashboard)'/layout.tsx src/app/'(dashboard)'/dashboard src/components/layout src/components/dashboard src/modules/reports/dashboard-query.ts tests/unit/components
git commit -m "feat: build the operations cockpit"
```

---

### Task 13: User Center and Task Center

**Files:**
- Create: `src/app/(dashboard)/users/page.tsx`
- Create: `src/app/(dashboard)/users/[id]/page.tsx`
- Create: `src/app/(dashboard)/tasks/page.tsx`
- Create: `src/app/(dashboard)/tasks/[id]/page.tsx`
- Create: `src/components/tables/user-table.tsx`
- Create: `src/components/tables/task-table.tsx`
- Create: `src/components/users/user-summary.tsx`
- Create: `src/components/users/user-timeline.tsx`
- Create: `src/components/tasks/task-actions.tsx`
- Create: `src/modules/users/user-queries.ts`
- Create: `src/modules/tasks/task-queries.ts`
- Create: `src/app/api/tasks/[id]/transition/route.ts`
- Create: `src/app/api/tasks/[id]/transfer/route.ts`
- Create: `src/app/api/users/[id]/notes/route.ts`
- Create: `src/app/api/users/[id]/segment-override/route.ts`
- Create: `src/app/api/users/[id]/sensitive/route.ts`
- Test: `tests/integration/ui/user-scope.test.ts`
- Test: `tests/e2e/task-workflow.spec.ts`

**Interfaces:**
- Consumes: task lifecycle and RBAC.
- Produces: paginated `findUsers`, `getUser360`, `findTasks`, `getTaskDetail`.
- Produces task mutation routes using existing state-machine functions.

- [ ] **Step 1: Write failing scope and filtering tests**

Create users/tasks assigned to two operators. Assert:

- operator sees only assigned users plus public tasks;
- admin sees all users;
- filters by A–G, country, region, owner, status, priority, source, and date are combined with AND;
- raw full IP is never returned to operator queries.

```ts
expect(operatorRows.every((row) => row.registrationIp === undefined)).toBe(true);
expect(operatorRows.map((row) => row.externalUserId)).toEqual(["demo-owned"]);
```

- [ ] **Step 2: Implement cursor-paginated user and task queries**

Use stable sort keys:

- users: `updatedAt desc, id desc`;
- tasks: `priority asc, dueAt asc, id asc`.

Limit pages to 100. Search normalized external ID, masked email, display name, country, and region. Never fetch encrypted integration data or full mail bodies in list queries.

- [ ] **Step 3: Build the user list and User 360 page**

User list columns:

- group, external ID, masked email/name, country/region, payment, call activity, balance, owner, next open task, last event.

User 360 sections:

- summary and current segment reason;
- payment/call/balance facts;
- segment history;
- external and operational event timeline;
- open/closed tasks;
- mail threads and suppression state;
- admin-only audited sensitive-detail reveal.

It also allows reason-label selection and user-level operational notes. Administrators can create/revoke a temporary segment override with reason and expiry; the UI must explain that active F anomalies cannot be overridden.

- [ ] **Step 4: Build task list and task detail**

Tabs: 我的任务、公共任务池、待回复、已逾期、全部任务.

Task detail includes user context, trigger reason, assignment reason, SLA countdown, timeline, suggested email template, notes, and actions. Buttons must derive from allowed state transitions rather than role-only visibility.

- [ ] **Step 5: Implement transition and transfer routes**

Route body:

```ts
const transitionSchema = z.object({
  action: z.enum(["claim", "start", "wait_user", "complete", "pause", "resume", "cancel"]),
  reason: z.string().trim().min(1).max(500).optional()
});
```

Transfer requires a target active operator/admin and a non-empty reason.

- [ ] **Step 6: Add notes, temporary override, and sensitive reveal routes**

- Notes require `tasks:work`, store the author, and appear in the user timeline.
- Segment overrides require `rules:publish`, expire within 30 days, and call Task 5 services.
- Sensitive reveal requires `users:reveal-sensitive`, recent reauthentication, and an audit record; operators always receive 403.

- [ ] **Step 7: Add an end-to-end operator workflow**

Playwright scenario:

1. log in as operator;
2. open public task pool;
3. claim a task;
4. start it;
5. add note;
6. mark waiting for user;
7. verify activity timeline and task count update.

- [ ] **Step 8: Verify and commit user/task pages**

```bash
npm run test:integration -- tests/integration/ui/user-scope.test.ts
npm run test:e2e -- tests/e2e/task-workflow.spec.ts
git add src/app/'(dashboard)'/users src/app/'(dashboard)'/tasks src/components/tables src/components/users src/components/tasks src/modules/users/user-queries.ts src/modules/tasks/task-queries.ts src/app/api/tasks src/app/api/users tests/integration/ui tests/e2e/task-workflow.spec.ts
git commit -m "feat: add user and task workspaces"
```

---

### Task 14: Mail Center, Automation Editors, Members, and Settings

**Files:**
- Create: `src/app/(dashboard)/mail/page.tsx`
- Create: `src/app/(dashboard)/mail/[threadId]/page.tsx`
- Create: `src/app/(dashboard)/automation/segments/page.tsx`
- Create: `src/app/(dashboard)/automation/assignment/page.tsx`
- Create: `src/app/(dashboard)/automation/notifications/page.tsx`
- Create: `src/app/(dashboard)/members/page.tsx`
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/components/mail/mail-composer.tsx`
- Create: `src/components/automation/rule-builder.tsx`
- Create: `src/components/automation/assignment-preview.tsx`
- Create: `src/components/members/member-table.tsx`
- Create: `src/components/settings/integration-card.tsx`
- Test: `tests/unit/components/mail-composer.test.tsx`
- Test: `tests/e2e/admin-rules.spec.ts`

**Interfaces:**
- Consumes: reviewed mail, assignment preview, invitations, 2FA, credential store.
- Produces administrator UI without bypassing server-side guards.

- [ ] **Step 1: Write failing mail-composer safety tests**

```tsx
render(<MailComposer draft={draft({ body: "你好，[称呼]" })} />);
expect(screen.getByRole("button", { name: "发送邮件" })).toBeDisabled();
expect(screen.getByText("仍有未替换变量：[称呼]")).toBeInTheDocument();

render(<MailComposer draft={draft({ body: "你好，张先生" })} suppressed />);
expect(screen.getByText("该用户已退订，禁止发送")).toBeInTheDocument();
```

- [ ] **Step 2: Build the mail center**

Views:

- 待回复
- 全部会话
- 草稿
- 发送失败
- 人工归档箱

Composer shows selected template version, final recipient, frequency status, suppression status, unresolved variables, editable subject/body, preview, and one explicit “审核并发送” action.

- [ ] **Step 3: Build segment, assignment, and notification editors**

Segment editor supports:

- A/B/C/D/E/F thresholds;
- task enabled/disabled;
- priority, SLA, and template key;
- preview affected user count;
- publish as a new rule version.

Assignment editor supports ordered drag handles, conditions, primary/fallback assignee, pool, workload limit, history sample preview, and unmatched count.

Notification editor supports level/channel matrix, retry intervals, escalation targets, and 10:00 daily digest time.

- [ ] **Step 4: Build members and security UI**

Primary admin:

- invite admin/operator;
- promote/demote/remove admin;
- transfer primary role with reauthentication;
- view all sessions and force logout.

Admin:

- invite/deactivate operators;
- cannot see primary transfer or administrator role controls.

Every member sees their own 2FA setup, recovery codes regeneration, session list, and password change.

- [ ] **Step 5: Build integration settings**

Cards:

- Namecheap 客服邮箱
- 企业微信邮箱
- 企业微信群机器人
- RightToken 数据源

Each card shows enabled state, last success, last error code, test button, and masked endpoint/account. Passwords/webhook URLs never return after saving.

- [ ] **Step 6: Add admin rule-publish E2E coverage**

Playwright:

1. log in as admin;
2. change A observation from 2 hours to 3 hours;
3. preview affected users;
4. publish;
5. verify new version and audit;
6. log in as operator and verify the editor route returns 403.

- [ ] **Step 7: Verify and commit admin workspaces**

```bash
npm test -- tests/unit/components/mail-composer.test.tsx
npm run test:e2e -- tests/e2e/admin-rules.spec.ts
npm run build
git add src/app/'(dashboard)'/mail src/app/'(dashboard)'/automation src/app/'(dashboard)'/members src/app/'(dashboard)'/settings src/components/mail src/components/automation src/components/members src/components/settings tests/unit/components/mail-composer.test.tsx tests/e2e/admin-rules.spec.ts
git commit -m "feat: add mail automation and administration workspaces"
```

---

### Task 15: Reports, Audit Explorer, and Health Monitoring

**Files:**
- Create: `src/app/(dashboard)/reports/page.tsx`
- Create: `src/app/(dashboard)/reports/audit/page.tsx`
- Create: `src/modules/reports/funnel-query.ts`
- Create: `src/modules/reports/segment-query.ts`
- Create: `src/modules/reports/task-query.ts`
- Create: `src/modules/reports/mail-query.ts`
- Create: `src/modules/reports/health-query.ts`
- Create: `src/components/reports/funnel-chart.tsx`
- Create: `src/components/reports/segment-trend.tsx`
- Create: `src/components/reports/report-filters.tsx`
- Create: `src/app/api/health/route.ts`
- Test: `tests/integration/reports/metrics.test.ts`
- Test: `tests/unit/reports/rates.test.ts`

**Interfaces:**
- Produces validated metric definitions and report queries.
- Produces `/api/health` with no secrets or PII.

- [ ] **Step 1: Write metric-definition tests before queries**

Define:

```ts
export function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
```

Test zero denominators, 7-day recall window boundaries, SLA response duration, and timezone boundaries in Asia/Shanghai.

- [ ] **Step 2: Implement report filters and scoped queries**

Filter schema:

```ts
const reportFilterSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  countryCodes: z.array(z.string().length(2)).default([]),
  regions: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  segments: z.array(z.enum(["A", "B", "C", "D", "E", "F", "G"])).default([]),
  ownerIds: z.array(z.string()).default([]),
  priorities: z.array(z.enum(["URGENT", "IMPORTANT", "NORMAL"])).default([])
});
```

Queries return:

- registration → checkout → payment → first call → retained funnel;
- current and historical A–G distribution;
- task response/completion/SLA;
- mail sent/failed/replied/unsubscribed;
- owner workload;
- channel and queue health.

- [ ] **Step 3: Build report pages**

Use accessible native SVG/CSS charts or a chart library already locked in `package-lock.json`. Every chart includes a table fallback and exact numerator/denominator definitions.

Show CSV export only to primary admin; route authorization remains the source of truth.

- [ ] **Step 4: Build the audit explorer**

Admins and primary admin can filter by actor, action, entity, and time. Sensitive metadata is masked. Export audit rows show fields, filters, record count, hash, and download time but never the file contents or token.

- [ ] **Step 5: Implement health endpoint**

Return:

```ts
type HealthResponse = {
  status: "healthy" | "degraded" | "down";
  database: { status: string; latencyMs: number };
  worker: { status: string; lastHeartbeatAt: string | null; oldestPendingJobSeconds: number | null };
  integrations: Array<{ kind: string; status: string; lastSuccessAt: string | null; lastErrorCode: string | null }>;
};
```

Anonymous requests receive only overall status; authenticated admins receive component details.

- [ ] **Step 6: Verify report calculations**

Seed a fixed cohort and assert exact counts/rates, including segment migration, reply rate, and overdue rate. Run:

```bash
npm test -- tests/unit/reports
npm run test:integration -- tests/integration/reports
npm run build
```

- [ ] **Step 7: Commit reports and health**

```bash
git add src/app/'(dashboard)'/reports src/modules/reports src/components/reports src/app/api/health tests/unit/reports tests/integration/reports
git commit -m "feat: add operational reports audit and health monitoring"
```

---

### Task 16: Simulated Data Source and Future RightToken Reconciliation Contract

**Files:**
- Create: `src/modules/integrations/righttoken/adapter.ts`
- Create: `src/modules/integrations/righttoken/simulator.ts`
- Create: `src/modules/integrations/righttoken/reconcile.ts`
- Create: `src/modules/integrations/righttoken/field-mapping.ts`
- Create: `src/worker/handlers/user-reconciliation.ts`
- Create: `src/app/api/integrations/righttoken/events/route.ts`
- Create: `scripts/generate-demo-events.ts`
- Test: `tests/contract/righttoken-adapter.test.ts`
- Test: `tests/integration/integrations/reconciliation.test.ts`

**Interfaces:**
- Produces: `RightTokenAdapter`.
- Produces: `reconcileUsers(adapter, cursor): ReconciliationResult`.
- Supplies simulator for all A–G and error cases.
- Exposes the authenticated future real-time event endpoint.

- [ ] **Step 1: Define the adapter contract and contract tests**

```ts
export interface RightTokenAdapter {
  listUsers(input: {
    updatedAfter?: Date;
    cursor?: string;
    limit: number;
  }): Promise<{
    users: RightTokenUserSnapshot[];
    nextCursor: string | null;
  }>;
  verifyConnection(): Promise<{ ok: true; source: string }>;
}
```

Contract tests require deterministic paging, stable external IDs, ISO timestamps, minor currency units, no secrets, and a maximum page of 500.

- [ ] **Step 2: Implement the simulator**

Generate synthetic users only:

- 25 A users with varying registration ages;
- 15 B users with checkout failure/expiry;
- 10 C users;
- 8 D users;
- 8 E users;
- 2 F users;
- 32 G users;
- duplicates, stale snapshots, and one malformed row for error testing.

All emails end in `@example.test`; all IPs use documentation ranges.

- [ ] **Step 3: Write failing reconciliation tests**

Prove:

- first sync inserts users;
- second identical sync creates no new tasks;
- newer facts update users but preserve operational owner/tasks/mail;
- stale external facts do not overwrite newer real-time events;
- malformed rows are isolated and reported.

- [ ] **Step 4: Implement reconciliation**

Use batches of 200, one transaction per batch, and save cursor/last-success metadata in the integration record. Perform incremental reconciliation every 15 minutes and full reconciliation daily at 02:00 Asia/Shanghai.

Return:

```ts
type ReconciliationResult = {
  scanned: number;
  inserted: number;
  updated: number;
  unchanged: number;
  isolated: number;
  segmentChanges: number;
  tasksCreated: number;
  nextCursor: string | null;
};
```

- [ ] **Step 5: Register the worker handler**

Add `user-reconciliation` to the worker and prevent overlapping runs with singleton key `righttoken-reconciliation:{mode}`.

- [ ] **Step 6: Expose the future real-time event endpoint**

`POST /api/integrations/righttoken/events` loads the encrypted integration credential from Task 9, compares the bearer secret using a timing-safe hash comparison, validates the Task 5 event union, calls `UserEventIngestionService.ingest`, and returns:

```json
{
  "accepted": true,
  "duplicate": false,
  "previous_segment": "B",
  "current_segment": "C"
}
```

Contract tests cover missing/invalid bearer tokens, unknown event types, duplicates, and valid events without using a production secret.

- [ ] **Step 7: Verify and commit the adapter seam**

```bash
npm run test:integration -- tests/contract/righttoken-adapter.test.ts tests/integration/integrations/reconciliation.test.ts
git add src/modules/integrations/righttoken src/worker/handlers/user-reconciliation.ts src/app/api/integrations/righttoken scripts/generate-demo-events.ts tests/contract tests/integration/integrations
git commit -m "feat: add simulated RightToken adapter and reconciliation"
```

---

### Task 17: Docker Deployment, Backup, Restore, and Runbook

**Files:**
- Create: `Dockerfile`
- Modify: `compose.yaml`
- Create: `docker/entrypoint-web.sh`
- Create: `docker/entrypoint-worker.sh`
- Create: `scripts/backup-postgres.sh`
- Create: `scripts/restore-postgres.sh`
- Create: `scripts/smoke-production.mjs`
- Create: `docs/deployment.md`
- Create: `docs/operations-runbook.md`
- Test: `tests/contract/docker-compose.test.ts`

**Interfaces:**
- Produces identical `web` and `worker` images.
- Produces one-command local stack and explicit production steps.
- Produces encrypted/off-host-compatible backup artifact and tested restore command.

- [ ] **Step 1: Write a failing deployment contract test**

Parse `compose.yaml` and assert services `web`, `worker`, and `db`; health checks; no published database port in production profile; named volumes; Node 24 image; separate commands for web and worker.

- [ ] **Step 2: Build a multi-stage Node 24 image**

Use `node:24.18.0-bookworm-slim`, install dependencies with `npm ci`, generate Prisma Client, build Next.js, and copy only production assets plus worker code. Run as a non-root user.

Web entrypoint:

```sh
#!/bin/sh
set -eu
npx prisma migrate deploy
exec npm run start
```

Worker entrypoint:

```sh
#!/bin/sh
set -eu
exec npm run worker
```

- [ ] **Step 3: Complete Docker Compose**

Add:

- `db` PostgreSQL 16 with health check and persistent volume;
- `web` waiting for healthy database;
- `worker` waiting for healthy database;
- environment loaded from `.env`;
- Web bound to `127.0.0.1:3000` for the existing reverse proxy;
- restart policy `unless-stopped`;
- health probes against `/api/health`.

- [ ] **Step 4: Implement backup and restore scripts**

`backup-postgres.sh`:

- validates an explicit backup directory argument;
- runs `pg_dump --format=custom`;
- writes SHA-256 checksum;
- prunes only files in that exact directory older than 30 days.

`restore-postgres.sh`:

- requires an explicit dump path and target database URL;
- refuses production hostnames unless `ALLOW_PRODUCTION_RESTORE=yes`;
- verifies checksum before restore;
- uses `pg_restore --clean --if-exists` only against the explicit target.

- [ ] **Step 5: Write deployment and operations docs**

`docs/deployment.md` includes DNS, TLS/reverse proxy, environment secrets, migration, first primary-admin seed, integration configuration, health check, rollback, and `recall.righttoken.ai`.

`docs/operations-runbook.md` includes failed email, failed WeCom, worker backlog, reconciliation failure, compromised member, primary transfer, export audit, backup, and restore procedures.

- [ ] **Step 6: Build and smoke-test production containers**

Run:

```bash
docker compose build
docker compose up -d
node scripts/smoke-production.mjs
docker compose ps
```

Expected: web, worker, and db healthy; login page 200; anonymous detailed health is hidden.

- [ ] **Step 7: Perform an isolated restore rehearsal**

Create synthetic data, take backup, restore into a separate database named `righttoken_recall_restore_test`, and compare counts for users, tasks, mail messages, audit logs, and primary admins.

- [ ] **Step 8: Commit deployment assets**

```bash
git add Dockerfile compose.yaml docker scripts/backup-postgres.sh scripts/restore-postgres.sh scripts/smoke-production.mjs docs/deployment.md docs/operations-runbook.md tests/contract/docker-compose.test.ts
git commit -m "ops: add container deployment backup and restore"
```

---

### Task 18: Full Acceptance, Security Regression, and Legacy Handoff

**Files:**
- Create: `tests/e2e/segmentation-lifecycle.spec.ts`
- Create: `tests/e2e/mail-reply.spec.ts`
- Create: `tests/e2e/primary-export.spec.ts`
- Create: `tests/e2e/notification-escalation.spec.ts`
- Create: `tests/e2e/access-control.spec.ts`
- Create: `tests/security/pii-leak.test.ts`
- Create: `tests/security/export-authorization.test.ts`
- Create: `docs/acceptance-report.md`
- Modify: `使用说明.txt`

**Interfaces:**
- Consumes all prior tasks.
- Produces acceptance evidence for the 17 design-spec scenarios.
- Produces user-facing handoff from legacy HTML to the new backend.

- [ ] **Step 1: Encode the complete segmentation lifecycle**

Playwright with fake clock:

1. register → A;
2. 2 hours unpaid → normal task;
3. checkout → B and old A task closes;
4. 30 minutes unpaid → important task;
5. payment → C and B task closes;
6. 24 hours no call → C help task;
7. first call → G;
8. 7 days inactive with balance → D;
9. balance exhausted → E;
10. complaint at any stage → F urgent task.

- [ ] **Step 2: Encode mail and reply acceptance**

Use a local fake SMTP/IMAP server. Verify reviewed send, immutable content, reply matching, important reply task, ambiguous unmatched inbox, suppression, contact-frequency limit, and no automatic user send.

- [ ] **Step 3: Encode role and export acceptance**

Verify:

- one primary admin invariant;
- multiple admins;
- admin manages operators but not admins;
- operator/admin cannot export by hidden UI or direct API;
- stale primary session requires reauthentication;
- one-time download and complete export audit;
- primary transfer leaves exactly one primary admin.

- [ ] **Step 4: Encode notification and retry acceptance**

Use fake WeCom and SMTP endpoints. Verify urgent three-channel notification, redaction, 15/30-minute escalation, important 2/4-hour SLA, normal 10:00 digest, retries, and dead-letter administrator alert.

- [ ] **Step 5: Add repository PII and secret scanning tests**

Scan tracked text files and built browser assets. Fail on:

- any email not ending in approved synthetic domains or documentation;
- IPv4 outside documentation/private ranges in fixtures;
- `mail.privateemail.com` passwords, WebCom webhook keys, bearer tokens, or base64 encryption keys;
- the 67 legacy real-email strings.

Allow the existing untracked legacy HTML as an explicit migration source only; do not copy it into app/test directories.

- [ ] **Step 6: Run the full quality gate**

Run in Node 24:

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
docker compose build
```

Expected: all commands exit 0.

- [ ] **Step 7: Perform manual visual verification**

Open at desktop, tablet, and mobile widths. Compare the cockpit to the approved visual:

- no design headings or module-description cards;
- deep navy sidebar and light content area;
- four metrics, priority tasks, A–G distribution, channel health, workload;
- clear focus states and no horizontal clipping at tablet width.

Capture screenshots into `docs/acceptance/` using synthetic data only.

- [ ] **Step 8: Write the acceptance report and update user instructions**

`docs/acceptance-report.md` lists every design acceptance scenario, automated test, result, screenshot, known operational dependency, and deployment command.

Update `使用说明.txt` to:

- mark the HTML as legacy/read-only;
- direct staff to `https://recall.righttoken.ai`;
- explain login, task processing, mail review, reply handling, and support escalation;
- remove instructions that suggest localStorage or manual CSV synchronization is the production workflow.

- [ ] **Step 9: Commit the verified release candidate**

```bash
git add tests/e2e tests/security docs/acceptance-report.md docs/acceptance 使用说明.txt
git commit -m "test: verify RightToken recall admin acceptance"
```

## Final Release Gate

Before deploying:

1. Confirm all 18 task commits exist and working tree contains no unintended tracked PII.
2. Run the full quality gate from Task 18 under Node 24.
3. Restore the most recent backup into an isolated database and compare entity counts.
4. Configure real SMTP/IMAP and WeCom credentials through the encrypted settings UI.
5. Keep the RightToken production adapter disabled; use simulator/CSV until production mapping is reviewed.
6. Deploy Web and Worker containers behind HTTPS at `recall.righttoken.ai`.
7. Create the real primary admin through the protected seed/bootstrap process, enable 2FA, and remove bootstrap credentials.
8. Send test notifications and a test email only to internal company accounts.
9. Record the deployment version, migration, backup, and smoke-test results in the audit/runbook.
