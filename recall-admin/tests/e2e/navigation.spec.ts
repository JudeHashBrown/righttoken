import "dotenv/config";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});
const e2ePort = process.env.RECALL_E2E_PORT ?? "3101";
const routes = [
  { path: "/dashboard", heading: "用户运营概览" },
  { path: "/tasks", heading: "任务中心" },
  { path: "/users", heading: "用户中心" },
  { path: "/mail", heading: "邮件中心" },
  { path: "/automation/segments", heading: "用户分组" },
  { path: "/automation/assignment", heading: "客户分配" },
  { path: "/automation/notifications", heading: "提醒设置" },
  { path: "/reports", heading: "数据报表" },
  { path: "/members", heading: "成员与权限" },
  { path: "/settings", heading: "系统设置" }
] as const;

let memberId: string;
let sessionToken: string;

test.beforeAll(async () => {
  memberId = randomUUID();
  sessionToken = randomBytes(32).toString("base64url");
  const now = new Date();
  await pool.query(
    `INSERT INTO recall."Member"
      ("id", "email", "displayName", "passwordHash", "role", "updatedAt")
     VALUES ($1, $2, 'E2E 管理员', 'not-used-in-this-test', 'ADMIN', $3)`,
    [memberId, `e2e-admin-${randomUUID()}@example.test`, now]
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
});

test.afterAll(async () => {
  if (memberId) {
    await pool.query(`DELETE FROM recall."Member" WHERE "id" = $1`, [
      memberId
    ]);
  }
  await pool.end();
});

test("local development opens the dashboard without login", async ({
  page
}) => {
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", {
      name: "用户运营概览",
      exact: true
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "退出" })
  ).toHaveCount(0);
});

test("every administrator navigation item opens a real page", async ({
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

  for (const route of routes) {
    const response = await page.goto(route.path);
    expect(response?.status(), route.path).toBeLessThan(400);
    if (route.path !== "/automation/segments") {
      await expect(
        page.getByRole("heading", { name: route.heading, exact: true })
      ).toBeVisible();
    }
    if (route.path === "/automation/segments") {
      await expect(page.getByRole("group", { name: "用户分组导航" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "预览并发布" })
      ).toBeVisible();
      await expect(page.getByRole("button", { name: /^F/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /^G/ })).toBeVisible();
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("segment-rules-desktop.png")
      });
    }
    if (route.path === "/users") {
      const segmentGroup = page.getByRole("group", { name: "分组" });
      const segmentButtons = segmentGroup.getByRole("button");

      await expect(segmentGroup).toBeVisible();
      await expect(segmentButtons).toHaveText([
        "全部",
        "F",
        "A",
        "B",
        "C",
        "D",
        "E",
        "G"
      ]);
      await expect(segmentGroup.getByRole("combobox")).toHaveCount(0);
      await expect(segmentButtons.first()).toHaveCSS("height", "36px");

      await page.getByLabel("国家").fill("CN");
      await segmentGroup.getByRole("button", { name: "F" }).click();
      await expect(page).toHaveURL(/segment=F/);
      await expect(page).toHaveURL(/countryCode=CN/);
      await expect(
        page.getByRole("button", { name: "F" })
      ).toHaveAttribute("aria-pressed", "true");
    }
    if (route.path === "/automation/assignment") {
      await expect(
        page.getByRole("button", { name: "预览分配" })
      ).toBeVisible();
    }
    if (route.path === "/automation/notifications") {
      await expect(
        page.getByRole("button", { name: "保存提醒设置" })
      ).toBeVisible();
    }
    if (route.path === "/members") {
      await expect(
        page.getByRole("button", { name: "添加成员" })
      ).toBeVisible();
    }
    if (route.path === "/reports") {
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath("reports-desktop.png")
      });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(pageWidth.scroll).toBe(pageWidth.client);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("settings-mobile.png")
  });
});

test("an invited member can open the account activation page", async ({
  page
}) => {
  const response = await page.goto(
    "/members/invitations/accept?token=opaque-invitation-token-123456"
  );
  expect(response?.status()).toBeLessThan(400);
  await expect(
    page.getByRole("heading", { name: "开通成员账号" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "完成账号开通" })
  ).toBeVisible();
});
