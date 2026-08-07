import "dotenv/config";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";

const e2ePort = process.env.RECALL_E2E_PORT ?? "3101";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1
});
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6L8AAAAASUVORK5CYII=",
  "base64"
);

let memberId: string;
let userId: string;
let mailboxId: string;
let threadId: string;
let taskId: string;
let templateId: string;
let inlineAssetId: string;
let attachmentAssetId: string;
let sessionToken: string;

test.beforeAll(async () => {
  sessionToken = randomBytes(32).toString("base64url");
  memberId = randomUUID();
  userId = randomUUID();
  mailboxId = randomUUID();
  threadId = randomUUID();
  taskId = randomUUID();
  templateId = randomUUID();
  inlineAssetId = randomUUID();
  attachmentAssetId = randomUUID();
  const messageId = randomUUID();
  const now = new Date();
  const userEmail =
    `mail-images-user-${randomUUID()}@example.test`;
  const mailboxAddress =
    `mail-images-${randomUUID()}@righttoken.test`;

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO recall."Member"
        ("id", "email", "displayName", "passwordHash", "role", "updatedAt")
       VALUES ($1, $2, '邮件图片测试管理员', 'not-used-in-this-test', 'ADMIN', $3)`,
      [memberId, `mail-images-${randomUUID()}@example.test`, now]
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
         "displayName", "registeredAt", "currentSegment", "updatedAt")
       VALUES ($1, $2, $3, $3, '图片来信用户', $4, 'B', $4)`,
      [userId, `mail-images-${randomUUID()}`, userEmail, now]
    );
    await pool.query(
      `INSERT INTO recall."Mailbox"
        ("id", "name", "emailAddress", "encryptedConfig", "enabled", "updatedAt")
       VALUES ($1, '图片联调邮箱', $2, 'e2e-encrypted-placeholder', true, $3)`,
      [mailboxId, mailboxAddress, now]
    );
    await pool.query(
      `INSERT INTO recall."MailThread"
        ("id", "userId", "mailboxId", "subject", "updatedAt")
       VALUES ($1, $2, $3, '图片与附件联调', $4)`,
      [threadId, userId, mailboxId, now]
    );
    await pool.query(
      `INSERT INTO recall."RecallTask"
        ("id", "userId", "origin", "triggerKey", "ruleVersion",
         "title", "reason", "priority", "status", "assigneeId",
         "dueAt", "updatedAt")
       VALUES ($1, $2, 'EMAIL_REPLY', $3, 1, '回复图片来信',
               '验证邮件图片闭环', 'IMPORTANT', 'TODO', $4, $5, $6)`,
      [
        taskId,
        userId,
        `mail-images-${randomUUID()}`,
        memberId,
        new Date(Date.now() + 60 * 60 * 1_000),
        now
      ]
    );
    await pool.query(
      `INSERT INTO recall."MailAsset"
        ("id", "storageKey", "fileName", "contentType", "byteSize",
         "sha256", "width", "height", "createdById")
       VALUES
        ($1, $2, 'guide.png', 'image/png', $3, $4, 1, 1, $5),
        ($6, $7, 'receipt.png', 'image/png', $3, $8, 1, 1, $5)`,
      [
        inlineAssetId,
        `e2e/${randomUUID()}.png`,
        pixel.length,
        "a".repeat(64),
        memberId,
        attachmentAssetId,
        `e2e/${randomUUID()}.png`,
        "b".repeat(64)
      ]
    );
    await pool.query(
      `INSERT INTO recall."MailTemplate"
        ("id", "key", "version", "name", "subject", "bodyText",
         "bodyHtml", "active", "createdById", "updatedAt")
       VALUES ($1, $2, 1, '图片协助', 'Re: 图片与附件联调',
               '请查看正文说明和附件。', $3, true, $4, $5)`,
      [
        templateId,
        `mail-images-${randomUUID()}`,
        `<p>请查看正文说明和附件。</p><img data-mail-asset-id="${inlineAssetId}" alt="模板说明">`,
        memberId,
        now
      ]
    );
    await pool.query(
      `INSERT INTO recall."MailTemplateAsset"
        ("id", "templateId", "assetId", "disposition", "cid", "sortOrder")
       VALUES
        ($1, $2, $3, 'INLINE', $4, 0),
        ($5, $2, $6, 'ATTACHMENT', NULL, 1)`,
      [
        randomUUID(),
        templateId,
        inlineAssetId,
        `${inlineAssetId}@righttoken`,
        randomUUID(),
        attachmentAssetId
      ]
    );
    await pool.query(
      `INSERT INTO recall."MailMessage"
        ("id", "mailboxId", "threadId", "userId", "taskId",
         "direction", "status", "providerMessageId", "references",
         "fromAddress", "toAddresses", "subject", "bodyText", "bodyHtml",
         "externalImagesBlocked", "receivedAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'INBOUND', 'RECEIVED', $6,
               ARRAY[]::text[], $7, ARRAY[$8]::text[],
               '图片与附件联调', '这是用户发来的图片。', $9, true, $10, $10)`,
      [
        messageId,
        mailboxId,
        threadId,
        userId,
        taskId,
        `<mail-images-${randomUUID()}@example.test>`,
        userEmail,
        mailboxAddress,
        `<p>这是用户发来的图片。</p><img data-mail-asset-id="${inlineAssetId}" alt="用户截图">`,
        now
      ]
    );
    await pool.query(
      `INSERT INTO recall."MailMessageAsset"
        ("id", "messageId", "assetId", "disposition", "cid", "sortOrder")
       VALUES
        ($1, $2, $3, 'INLINE', 'inline@example.test', 0),
        ($4, $2, $5, 'ATTACHMENT', NULL, 1)`,
      [
        randomUUID(),
        messageId,
        inlineAssetId,
        randomUUID(),
        attachmentAssetId
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
    `DELETE FROM recall."MailTemplate" WHERE "id" = $1`,
    [templateId]
  );
  await pool.query(
    `DELETE FROM recall."Mailbox" WHERE "id" = $1`,
    [mailboxId]
  );
  await pool.query(
    `DELETE FROM recall."MailAsset" WHERE "id" = ANY($1::text[])`,
    [[inlineAssetId, attachmentAssetId]]
  );
  await pool.query(
    `DELETE FROM recall."RecallTask" WHERE "id" = $1`,
    [taskId]
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

test("template images flow into replies and incoming images remain private", async ({
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

  const captured: {
    publishedPayload: Record<string, unknown> | null;
    replyPayload: Record<string, unknown> | null;
  } = {
    publishedPayload: null,
    replyPayload: null
  };
  await page.route("**/api/mail/assets**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          asset: {
            id: "uploaded-e2e-asset",
            fileName: "new-guide.png",
            contentType: "image/png",
            byteSize: pixel.length,
            width: 1,
            height: 1,
            previewUrl: "/api/mail/assets/uploaded-e2e-asset"
          }
        })
      });
      return;
    }
    await route.fulfill({
      contentType: "image/png",
      body: pixel
    });
  });
  await page.route(
    "**/api/mail/templates/*/versions",
    async (route) => {
      captured.publishedPayload =
        route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ template: { id: "version-2" } })
      });
    }
  );
  await page.route("**/api/mail/reply", async (route) => {
    captured.replyPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        message: { id: "sent-e2e", status: "SENT" }
      })
    });
  });

  await page.goto("/mail?view=templates");
  await page.getByRole("tab", { name: "图片协助" }).click();
  await page
    .getByLabel("选择附件")
    .setInputFiles({
      name: "new-guide.png",
      mimeType: "image/png",
      buffer: pixel
    });
  await page.getByRole("button", { name: "保存模板修改" }).click();
  await expect
    .poll(() => captured.publishedPayload)
    .not.toBeNull();
  expect(
    captured.publishedPayload?.assets as Array<{ id: string }>
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "uploaded-e2e-asset" })
    ])
  );

  await page.goto(
    `/mail?view=replies&selected=${encodeURIComponent(threadId)}`
  );
  await expect(page.getByAltText("用户截图")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /receipt\.png/ })
  ).toBeVisible();
  await expect(
    page.getByText("为保护隐私，已拦截邮件中的外部图片")
  ).toBeVisible();

  await page.getByRole("tab", { name: "图片协助" }).click();
  await expect(page.getByAltText("模板说明")).toBeVisible();
  await page.getByRole("button", { name: "发送回复" }).click();
  await expect.poll(() => captured.replyPayload).not.toBeNull();
  expect(captured.replyPayload?.bodyHtml).toContain(
    `data-mail-asset-id="${inlineAssetId}"`
  );
  expect(captured.replyPayload?.assets).toHaveLength(2);
});

test("group mail sends only the audience selector to the server", async ({
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

  let batchPayload: Record<string, unknown> | null = null;
  await page.route(
    "**/api/mail/audience-preview**",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          label: "F 组全员",
          total: 12,
          estimatedSkipped: 2
        })
      });
    }
  );
  await page.route("**/api/mail/batches", async (route) => {
    batchPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ batch: { id: "batch-e2e" } })
    });
  });

  await page.goto("/mail?view=replies&compose=1");
  await page
    .getByRole("radio", { name: "指定分组" })
    .click();
  await page.getByLabel("选择分组").selectOption("F");
  await expect(
    page.getByText("预计 12 人，自动跳过 2 人")
  ).toBeVisible();
  await page.getByLabel("邮件主题").fill("F 组服务提醒");
  await page
    .getByRole("textbox", { name: "邮件正文" })
    .fill("这是一封独立投递的测试邮件。");
  await page
    .getByRole("button", { name: "确认创建群发" })
    .click();

  await expect.poll(() => batchPayload).not.toBeNull();
  expect(batchPayload).toMatchObject({
    mode: "SEGMENT",
    segment: "F"
  });
  expect(batchPayload).not.toHaveProperty("recipient");
  expect(batchPayload).not.toHaveProperty("userId");
  expect(batchPayload).not.toHaveProperty("emails");
  await expect(
    page.getByText("群发任务已创建，可在下方查看进度")
  ).toBeVisible();
});
