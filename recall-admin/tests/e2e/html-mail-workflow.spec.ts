import "dotenv/config";

import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const e2ePort = process.env.RECALL_E2E_PORT ?? "3101";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1
});

let memberId: string;
let userId: string;
let mailboxId: string;
let sessionToken: string;

test.beforeAll(async () => {
  memberId = randomUUID();
  userId = randomUUID();
  mailboxId = randomUUID();
  sessionToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const userEmail =
    `html-mail-user-${randomUUID()}@example.test`;

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO recall."Member"
        ("id", "email", "displayName", "passwordHash", "role", "updatedAt")
       VALUES ($1, $2, 'HTML 邮件测试管理员',
               'not-used-in-this-test', 'ADMIN', $3)`,
      [
        memberId,
        `html-mail-admin-${randomUUID()}@example.test`,
        now
      ]
    );
    await pool.query(
      `INSERT INTO recall."Session"
        ("id", "memberId", "tokenHash", "expiresAt")
       VALUES ($1, $2, $3, $4)`,
      [
        randomUUID(),
        memberId,
        createHash("sha256")
          .update(sessionToken)
          .digest("hex"),
        new Date(Date.now() + 60 * 60 * 1_000)
      ]
    );
    await pool.query(
      `INSERT INTO recall."UserProfile"
        ("id", "externalUserId", "email", "emailNormalized",
         "displayName", "registeredAt", "currentSegment", "updatedAt")
       VALUES ($1, $2, $3, $3, 'HTML 邮件用户', $4, 'B', $4)`,
      [
        userId,
        `html-mail-${randomUUID()}`,
        userEmail,
        now
      ]
    );
    await pool.query(
      `INSERT INTO recall."Mailbox"
        ("id", "name", "emailAddress", "encryptedConfig",
         "enabled", "updatedAt")
       VALUES ($1, 'HTML 邮件测试邮箱', $2,
               'e2e-encrypted-placeholder', true, $3)`,
      [
        mailboxId,
        `html-mail-${randomUUID()}@righttoken.test`,
        now
      ]
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
});

test.afterAll(async () => {
  await pool.query(
    `DELETE FROM recall."Mailbox" WHERE "id" = $1`,
    [mailboxId]
  );
  await pool.query(
    `DELETE FROM recall."UserProfile" WHERE "id" = $1`,
    [userId]
  );
  await pool.query(
    `DELETE FROM recall."Member" WHERE "id" = $1`,
    [memberId]
  );
  await pool.end();
});

test("authors, sanitizes, previews, and submits a complete HTML email", async ({
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

  const sourceHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width">
    <style>
      .card { width: 100%; color: #2563eb; }
      @media (max-width: 600px) { .card { width: 100% !important; } }
    </style>
  </head>
  <body>
    <table class="card" role="presentation">
      <tbody><tr><td>完整 HTML 邮件</td></tr></tbody>
    </table>
    <img src="https://cdn.example.test/hero.png" alt="外链主图">
    <script>alert("blocked")</script>
  </body>
</html>`;
  let sendPayload: Record<string, unknown> | null = null;

  await page.route("https://cdn.example.test/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6L8AAAAASUVORK5CYII=",
        "base64"
      )
    });
  });
  await page.route("**/api/mail/send", async (route) => {
    sendPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        message: { id: "html-e2e-sent", status: "SENT" },
        taskId: "html-e2e-task"
      })
    });
  });

  await page.goto(
    `/mail?view=replies&compose=1&userId=${encodeURIComponent(
      userId
    )}`
  );
  await page.getByLabel("发件邮箱").selectOption(mailboxId);
  await page.getByLabel("邮件主题").fill("完整 HTML 邮件测试");
  await page
    .getByRole("button", { name: "HTML 源码" })
    .click();
  await page.getByLabel("HTML 邮件源码").fill(sourceHtml);

  await page
    .getByRole("button", { name: "发送预览" })
    .click();
  const preview = page.getByTitle("HTML 邮件发送预览");
  await expect(preview).toBeVisible();
  await expect(
    page.getByText("含 1 张 HTTPS 外链图片")
  ).toBeVisible();
  await expect(page.getByText("已移除不安全内容")).toBeVisible();
  const previewHtml = await preview.getAttribute("srcdoc");
  expect(previewHtml).toContain("<!DOCTYPE html>");
  expect(previewHtml).toContain("<table");
  expect(previewHtml).toContain("@media");
  expect(previewHtml).not.toContain("<script");

  const sendButton = page.getByRole("button", {
    name: "确认并发送"
  });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  await expect.poll(() => sendPayload).not.toBeNull();
  expect(sendPayload).toMatchObject({
    userId,
    mailboxId,
    subject: "完整 HTML 邮件测试",
    bodyHtml: sourceHtml,
    bodyText: "完整 HTML 邮件"
  });
  await expect(
    page.getByText("邮件已发送，任务已进入等待用户回复")
  ).toBeVisible();
});

test("adds a safe hyperlink and preserves it in send preview", async ({
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
  await page.goto(
    `/mail?view=replies&compose=1&userId=${encodeURIComponent(
      userId
    )}`
  );
  await page.getByLabel("邮件主题").fill("超链接测试");
  const editor = page.getByRole("textbox", { name: "邮件正文" });
  await editor.fill("查看帮助");
  await editor.selectText();
  await page.getByRole("button", { name: "超链接" }).click();
  await page.getByLabel("链接地址").fill("righttoken.ai/help");
  await page.getByRole("button", { name: "保存链接" }).click();
  await page.getByRole("button", { name: "发送预览" }).click();

  const preview = page.getByTitle("HTML 邮件发送预览");
  await expect(preview).toBeVisible();
  const source = await preview.getAttribute("srcdoc");
  expect(source).toContain('href="https://righttoken.ai/help"');
  expect(source).toContain('target="_blank"');
  expect(source).toContain('rel="noopener noreferrer"');
});
