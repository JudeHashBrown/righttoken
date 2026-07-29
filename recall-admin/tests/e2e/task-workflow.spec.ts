import "dotenv/config";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});
const e2ePort = process.env.RECALL_E2E_PORT ?? "3101";

let memberId: string;
let userId: string;
let taskId: string;
let sessionToken: string;

test.beforeAll(async () => {
  sessionToken = randomBytes(32).toString("base64url");
  memberId = randomUUID();
  userId = randomUUID();
  taskId = randomUUID();
  const now = new Date();
  const email = `e2e-operator-${randomUUID()}@example.test`;
  const userEmail = `e2e-user-${randomUUID()}@example.test`;
  await pool.query(
    `INSERT INTO recall."Member"
      ("id", "email", "displayName", "passwordHash", "role", "updatedAt")
     VALUES ($1, $2, $3, $4, 'OPERATOR', $5)`,
    [memberId, email, "E2E 运营", "not-used-in-this-test", now]
  );
  await pool.query(
    `INSERT INTO recall."Session"
      ("id", "memberId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3, $4)`,
    [
      randomUUID(),
      memberId,
      createHash("sha256").update(sessionToken).digest("hex"),
      new Date(Date.now() + 60 * 60 * 1_000)
    ]
  );
  await pool.query(
    `INSERT INTO recall."UserProfile"
      ("id", "externalUserId", "email", "emailNormalized",
       "displayName", "registeredAt", "countryCode", "region",
       "source", "currentSegment", "ownerId", "updatedAt")
     VALUES ($1, $2, $3, $3, $4, $5, 'SG', 'Singapore',
             'e2e', 'B', $6, $5)`,
    [
      userId,
      `e2e-user-${randomUUID()}`,
      userEmail,
      "E2E 测试用户",
      now,
      memberId
    ]
  );
  await pool.query(
    `INSERT INTO recall."RecallTask"
      ("id", "userId", "origin", "triggerKey", "ruleVersion",
       "title", "reason", "priority", "dueAt", "updatedAt")
     VALUES ($1, $2, 'MANUAL', $3, 1, $4, $5,
             'IMPORTANT', $6, $7)`,
    [
      taskId,
      userId,
      `e2e-task-${randomUUID()}`,
      "E2E 支付未完成跟进",
      "验证运营完整任务流程",
      new Date(Date.now() + 60 * 60 * 1_000),
      now
    ]
  );
});

test.afterAll(async () => {
  if (userId) {
    await pool.query(`DELETE FROM recall."UserProfile" WHERE "id" = $1`, [
      userId
    ]);
  }
  if (memberId) {
    await pool.query(`DELETE FROM recall."Member" WHERE "id" = $1`, [
      memberId
    ]);
  }
  await pool.end();
});

test("operator claims and processes a public task with a note", async ({
  context,
  page
}, testInfo) => {
  await context.addCookies([
    {
      name: "rt_recall_session",
      value: sessionToken,
      url: `http://127.0.0.1:${e2ePort}`
    }
  ]);

  await page.goto("/tasks?view=pool");
  await expect(
    page.getByRole("heading", { name: "任务中心" })
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("task-center.png")
  });
  await page
    .getByRole("link", { name: "E2E 支付未完成跟进" })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "E2E 支付未完成跟进"
    })
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("task-detail.png")
  });
  await page.getByRole("button", { name: "领取任务" }).click();
  await expect(
    page.getByRole("button", { name: "开始处理" })
  ).toBeVisible();

  await page.getByRole("button", { name: "开始处理" }).click();
  await expect(
    page.getByRole("button", { name: "等待用户" })
  ).toBeVisible();

  await page
    .getByLabel("新增运营备注")
    .fill("已联系用户，等待补充支付信息");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(page.getByLabel("新增运营备注")).toHaveValue("");

  await page.getByRole("button", { name: "等待用户" }).click();
  await expect(page.getByText("等待用户", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "查看用户详情" }).click();
  await expect(
    page.getByText("已联系用户，等待补充支付信息")
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/users/${userId}$`));
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("user-360-desktop.png")
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(pageWidth.scroll).toBe(pageWidth.client);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("user-360-mobile.png")
  });
});
