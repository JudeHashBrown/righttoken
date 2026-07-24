import "dotenv/config";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});
const e2ePort = process.env.RECALL_E2E_PORT ?? "3101";

let memberId: string;
let sessionToken: string;

test.beforeAll(async () => {
  memberId = randomUUID();
  sessionToken = randomBytes(32).toString("base64url");
  const now = new Date();
  await pool.query(
    `INSERT INTO "Member"
      ("id", "email", "displayName", "passwordHash", "role", "updatedAt")
     VALUES ($1, $2, '规则 E2E 管理员', 'not-used', 'ADMIN', $3)`,
    [memberId, `segment-e2e-${randomUUID()}@example.test`, now]
  );
  await pool.query(
    `INSERT INTO "Session"
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
    await pool.query(`DELETE FROM "Member" WHERE "id" = $1`, [
      memberId
    ]);
  }
  await pool.end();
});

test("administrator previews, publishes and inspects history", async ({
  context,
  page
}) => {
  await context.addCookies([
    {
      name: "rt_recall_session",
      value: sessionToken,
      url: `http://127.0.0.1:${e2ePort}`
    }
  ]);
  await page.route(
    "**/api/automation/segment-rules/preview",
    async (route) => {
      const body = route.request().postDataJSON() as {
        draft: { groups: Array<{ code: string; annotation: string }> };
      };
      expect(
        body.draft.groups.find((group) => group.code === "A")?.annotation
      ).toBe("注册后未支付，需要重点跟进");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          totalUsers: 182,
          distribution: {
            A: 105,
            B: 15,
            C: 10,
            D: 8,
            E: 10,
            F: 2,
            G: 32
          },
          migrations: 3,
          overlapUsers: 1,
          fallbackUsers: 32,
          tasksToCancel: 2,
          tasksToCreate: 3,
          urgentTasksToCreate: 1,
          samples: [],
          token: "e2e-signed-preview",
          expiresAt: "2026-07-24T14:00:00.000Z"
        })
      });
    }
  );
  await page.route(
    "**/api/automation/segment-rules",
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      expect(route.request().headers()["idempotency-key"]).toBeTruthy();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ version: 2, runId: "e2e-run" })
      });
    }
  );
  await page.route(
    "**/api/automation/segment-rules/runs/e2e-run",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          run: {
            status: "COMPLETED",
            totalUsers: 182,
            processedUsers: 182,
            succeededUsers: 182,
            failedUsers: 0
          }
        })
      });
    }
  );
  await page.route(
    "**/api/automation/segment-rules/history",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          versions: [
            {
              id: "version-2",
              version: 2,
              active: true,
              createdAt: "2026-07-24T13:00:00.000Z",
              createdBy: "规则 E2E 管理员",
              changeSummary: "优化 A 组运营范围",
              runs: [
                {
                  id: "e2e-run",
                  status: "COMPLETED",
                  totalUsers: 182,
                  processedUsers: 182,
                  failedUsers: 0
                }
              ]
            }
          ]
        })
      });
    }
  );

  await page.goto("/automation/segments");
  await page.getByRole("button", { name: "A 组展开" }).click();
  await page
    .getByLabel("A 组注释")
    .fill("注册后未支付，需要重点跟进");
  await page.getByRole("button", { name: "预览并发布" }).click();
  await expect(page.getByText("预计迁移 3 人")).toBeVisible();
  await page.getByLabel("本次变更说明").fill("优化 A 组运营范围");
  await page
    .getByRole("button", { name: "确认发布新版本" })
    .click();
  await expect(
    page.getByText("分组规则 v2 已发布，正在全量重算")
  ).toBeVisible();
  await expect(
    page.getByText(/182\/182 已处理，\s*成功 182，失败 0/)
  ).toBeVisible();

  await page.getByRole("button", { name: "查看历史版本" }).click();
  await expect(page.getByText("优化 A 组运营范围")).toBeVisible();
  await expect(page.getByText(/COMPLETED · 182\/182/)).toBeVisible();
});
