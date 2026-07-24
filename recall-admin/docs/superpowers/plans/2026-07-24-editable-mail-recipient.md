# Editable Mail Recipient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow every member with reviewed-mail permission to edit the final recipient while preserving task scope, suppression, pause, frequency, audit, and reply-thread protections.

**Architecture:** Extend the reviewed-mail service and `/api/mail/send` contract with one normalized `recipient` value. Keep the message linked to the selected task and user, store the actual destination in `MailMessage.toAddresses`, and make the existing composer own the editable field and reset behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Prisma/PostgreSQL, Nodemailer, Vitest, Testing Library, Playwright.

## Global Constraints

- Every send still requires a selected task and an enabled mailbox.
- Every role with `mail:send-reviewed` may edit the final recipient.
- Editing the recipient never broadens task or user access.
- A paused or unsubscribed task user always blocks sending.
- A suppressed final recipient always blocks sending.
- Contact frequency remains keyed to the task user.
- Full email addresses remain in protected mail records, not duplicated into audit metadata.
- No database migration or new dependency is required.

---

### Task 1: Reviewed-Mail Service Supports the Actual Recipient

**Files:**
- Modify: `src/modules/mail/send-reviewed-mail.ts`
- Modify: `tests/integration/mail/reviewed-send.test.ts`

**Interfaces:**
- Consumes: existing `MailboxAdapter.send`, `assertMailSendAllowed`, Prisma `MailMessage`, task/user permission checks.
- Produces: `ReviewedMailInput.recipient: string`; `sendReviewedMail()` sends and records the normalized actual recipient.

- [ ] **Step 1: Write a failing integration test for an overridden recipient**

Add a test that uses a unique controlled address and verifies delivery, persistence, task/user linkage, and audit metadata:

```ts
it("sends to the reviewed override and records a safe audit marker", async () => {
  const recipient = `manual-${randomUUID()}@example.test`;
  const adapter = {
    testConnection: vi.fn(),
    listMessagesSince: vi.fn(),
    send: vi.fn().mockResolvedValue({
      providerMessageId: "<manual-recipient@example.test>"
    })
  };

  const sent = await sendReviewedMail(
    {
      actorId: memberId,
      mailboxId,
      taskId,
      recipient,
      subject: "RightToken 邮箱联调",
      bodyText: "这是一封人工确认的联调邮件。",
      minimumContactIntervalMinutes: 0,
      now: new Date("2026-07-24T09:00:00.000Z")
    },
    adapter
  );

  expect(adapter.send).toHaveBeenCalledWith({
    to: [recipient],
    subject: "RightToken 邮箱联调",
    text: "这是一封人工确认的联调邮件。"
  });
  expect(sent).toMatchObject({
    taskId,
    userId,
    toAddresses: [recipient]
  });
  await expect(
    prisma.auditLog.findFirstOrThrow({
      where: { entityId: sent.id, action: "mail.reviewed_sent" }
    })
  ).resolves.toMatchObject({
    metadata: expect.objectContaining({
      recipientOverridden: true,
      recipientDomain: "example.test"
    })
  });
});
```

- [ ] **Step 2: Write a failing integration test for final-recipient suppression**

Create and clean up a `SuppressionEntry`, then require the stable block code:

```ts
it("blocks a manually entered address on the suppression list", async () => {
  const recipient = `suppressed-${randomUUID()}@example.test`;
  await prisma.suppressionEntry.create({
    data: {
      emailNormalized: recipient,
      reason: "integration test",
      source: "test"
    }
  });
  try {
    await expect(
      sendReviewedMail(
        {
          actorId: memberId,
          mailboxId,
          taskId,
          recipient,
          subject: "不可发送",
          bodyText: "退订名单应阻止这封邮件。",
          minimumContactIntervalMinutes: 0
        },
        {
          send: vi.fn()
        }
      )
    ).rejects.toMatchObject({ code: "RECIPIENT_SUPPRESSED" });
  } finally {
    await prisma.suppressionEntry.delete({
      where: { emailNormalized: recipient }
    });
  }
});
```

- [ ] **Step 3: Run the focused integration test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run tests/integration/mail/reviewed-send.test.ts
```

Expected: TypeScript/runtime failure because `ReviewedMailInput` does not accept `recipient`, or assertions show the task-user address was used.

- [ ] **Step 4: Implement actual-recipient validation and persistence**

Extend the input:

```ts
export type ReviewedMailInput = {
  actorId: string;
  mailboxId: string;
  taskId: string;
  recipient: string;
  subject: string;
  bodyText: string;
  minimumContactIntervalMinutes: number;
  now?: Date;
};
```

At the start of `sendReviewedMail`, normalize once:

```ts
const recipient = input.recipient.trim().toLowerCase();
```

Load suppression for both the task-user address and actual recipient:

```ts
const [userSuppressed, recipientSuppressed, lastSent] =
  await Promise.all([
    prisma.suppressionEntry.findUnique({
      where: { emailNormalized: task.user.emailNormalized },
      select: { id: true }
    }),
    prisma.suppressionEntry.findUnique({
      where: { emailNormalized: recipient },
      select: { id: true }
    }),
    prisma.mailMessage.findFirst({
      where: {
        userId: task.user.id,
        direction: "OUTBOUND",
        status: "SENT"
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true }
    })
  ]);
```

Pass `unsubscribedAt: now` when either suppression exists, persist `toAddresses: [recipient]`, call the adapter with `to: [recipient]`, and add safe audit fields:

```ts
const originalRecipient = task.user.email.trim().toLowerCase();
const recipientOverridden = recipient !== originalRecipient;

metadata: {
  taskId: task.id,
  mailboxId: mailbox.id,
  recipientOverridden,
  recipientDomain: recipient.split("@")[1] ?? "unknown",
  originalRecipientDomain:
    originalRecipient.split("@")[1] ?? "unknown"
}
```

- [ ] **Step 5: Update the existing non-override test input**

Load the task user email once in the test or query it from Prisma, then pass it as `recipient`. Keep the existing expectations unchanged so the default path remains covered.

- [ ] **Step 6: Run the focused integration test and verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run tests/integration/mail/reviewed-send.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 7: Commit the service change**

```bash
git add src/modules/mail/send-reviewed-mail.ts tests/integration/mail/reviewed-send.test.ts
git commit -m "feat: support reviewed recipient overrides"
```

---

### Task 2: Mail Send API Accepts a Validated Recipient

**Files:**
- Modify: `src/app/api/mail/send/route.ts`
- Create: `tests/unit/mail/send-request-schema.test.ts`
- Create: `src/modules/mail/send-request-schema.ts`

**Interfaces:**
- Consumes: `sendReviewedMail(input, adapter)` from Task 1.
- Produces: `mailSendRequestSchema`; API request requires normalized `recipient`.

- [ ] **Step 1: Write failing schema tests**

Create:

```ts
import { describe, expect, it } from "vitest";
import { mailSendRequestSchema } from "@/modules/mail/send-request-schema";

const valid = {
  mailboxId: "mailbox-1",
  taskId: "task-1",
  recipient: "  Test.User@Example.Test ",
  subject: "RightToken 测试",
  bodyText: "测试邮件正文"
};

describe("mailSendRequestSchema", () => {
  it("normalizes a reviewed recipient", () => {
    expect(mailSendRequestSchema.parse(valid).recipient).toBe(
      "test.user@example.test"
    );
  });

  it.each(["", "not-an-email", "a@"])(
    "rejects invalid recipient %s",
    (recipient) => {
      expect(
        mailSendRequestSchema.safeParse({ ...valid, recipient }).success
      ).toBe(false);
    }
  );
});
```

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/mail/send-request-schema.test.ts
```

Expected: FAIL because `send-request-schema.ts` does not exist.

- [ ] **Step 3: Implement the shared request schema**

Create:

```ts
import { z } from "zod";

export const mailSendRequestSchema = z
  .object({
    mailboxId: z.string().min(1),
    taskId: z.string().min(1),
    recipient: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(320),
    subject: z.string().trim().min(1).max(200),
    bodyText: z.string().trim().min(1).max(100_000)
  })
  .strict();
```

- [ ] **Step 4: Wire the route to the shared schema**

Remove the private `sendSchema` and Zod import from the route, import `mailSendRequestSchema`, parse with it, and pass the parsed `recipient` through the existing spread:

```ts
const parsed = mailSendRequestSchema.safeParse(
  await request.json().catch(() => null)
);
```

- [ ] **Step 5: Run unit, type, and focused integration checks**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/mail/send-request-schema.test.ts
./node_modules/.bin/vitest run tests/integration/mail/reviewed-send.test.ts
npm run typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Commit the API contract**

```bash
git add src/app/api/mail/send/route.ts src/modules/mail/send-request-schema.ts tests/unit/mail/send-request-schema.test.ts
git commit -m "feat: validate editable mail recipients"
```

---

### Task 3: Composer Exposes and Resets the Editable Recipient

**Files:**
- Modify: `src/components/mail/mail-composer.tsx`
- Modify: `tests/unit/components/mail-composer.test.tsx`

**Interfaces:**
- Consumes: task `recipient` defaults and `/api/mail/send` request contract from Task 2.
- Produces: editable “最终收件人” input, override warning, recipient in request body.

- [ ] **Step 1: Write failing UI tests**

Add a second task:

```ts
const secondTask = {
  ...task,
  id: "task-2",
  userLabel: "第二位用户",
  recipient: "second@example.test"
};
```

Test editing, warning, payload, and reset:

```ts
it("submits an edited recipient and resets it when the task changes", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        message: { id: "message-1", status: "SENT" }
      })
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MailComposer
      tasks={[task, secondTask]}
      mailboxes={[mailbox]}
      initialSubject="RightToken 使用提醒"
      initialBody="你好，我们可以协助你。"
    />
  );

  const recipient = screen.getByLabelText("最终收件人");
  fireEvent.change(recipient, {
    target: { value: "manual@example.test" }
  });
  expect(screen.getByText("当前使用手动收件人")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("关联任务与用户"), {
    target: { value: "task-2" }
  });
  expect(recipient).toHaveValue("second@example.test");

  fireEvent.change(recipient, {
    target: { value: "manual@example.test" }
  });
  fireEvent.click(
    screen.getByRole("button", { name: "审核并发送" })
  );
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mail/send",
      expect.objectContaining({
        body: expect.stringContaining(
          '"recipient":"manual@example.test"'
        )
      })
    );
  });
});
```

Add invalid-email coverage:

```ts
it("blocks an invalid final recipient", () => {
  render(
    <MailComposer
      tasks={[task]}
      mailboxes={[mailbox]}
      initialSubject="RightToken 使用提醒"
      initialBody="你好，我们可以协助你。"
    />
  );
  fireEvent.change(screen.getByLabelText("最终收件人"), {
    target: { value: "invalid-email" }
  });
  expect(
    screen.getByRole("button", { name: "审核并发送" })
  ).toBeDisabled();
});
```

- [ ] **Step 2: Run the composer test and verify RED**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/components/mail-composer.test.tsx
```

Expected: FAIL because the recipient input is read-only, there is no override warning, and the request omits `recipient`.

- [ ] **Step 3: Implement controlled recipient state**

Add:

```ts
const [recipient, setRecipient] = useState(
  tasks[0]?.recipient ?? ""
);
const normalizedRecipient = recipient.trim().toLowerCase();
const originalRecipient =
  selectedTask?.recipient.trim().toLowerCase() ?? "";
const recipientValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
  normalizedRecipient
);
const recipientOverridden =
  Boolean(selectedTask) &&
  recipientValid &&
  normalizedRecipient !== originalRecipient;
```

Include `!recipientValid` in `blocked`. When the task changes, update both values in one handler:

```ts
function selectTask(nextTaskId: string): void {
  setTaskId(nextTaskId);
  setRecipient(
    tasks.find((task) => task.id === nextTaskId)?.recipient ?? ""
  );
}
```

Make the field editable and accessible:

```tsx
<div className={styles.field}>
  <label htmlFor="mail-recipient">最终收件人</label>
  <input
    className={styles.input}
    id="mail-recipient"
    type="email"
    value={recipient}
    onChange={(event) => setRecipient(event.target.value)}
    required
    disabled={submitting}
  />
</div>
```

Show the warning when overridden:

```tsx
{recipientOverridden ? (
  <p className={styles.notice}>
    当前使用手动收件人，邮件仍会关联所选任务并记录实际地址。
  </p>
) : null}
```

Add `recipient: normalizedRecipient` to the request body.

- [ ] **Step 4: Run the composer test and verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/components/mail-composer.test.tsx
```

Expected: all composer tests pass.

- [ ] **Step 5: Commit the UI**

```bash
git add src/components/mail/mail-composer.tsx tests/unit/components/mail-composer.test.tsx
git commit -m "feat: make reviewed mail recipient editable"
```

---

### Task 4: Reply Regression and Full Verification

**Files:**
- Modify only if a regression is found: `src/modules/mail/reply-matcher.ts`
- Modify only if a regression is found: `tests/unit/mail/reply-matcher.test.ts`
- Modify only if a regression is found: `tests/integration/mail/reply-sync.test.ts`

**Interfaces:**
- Consumes: stored `providerMessageId`, `inReplyTo`, `references`, task/user links.
- Produces: verified unchanged reply matching and a clean local commit history.

- [ ] **Step 1: Run reply matching regression tests**

Run:

```bash
./node_modules/.bin/vitest run tests/unit/mail/reply-matcher.test.ts tests/integration/mail/reply-sync.test.ts
```

Expected: exact `In-Reply-To` and `References` matching tests pass without requiring sender equality.

- [ ] **Step 2: Run all automated tests**

Run:

```bash
npm test
npm run test:integration
npm run test:e2e
```

Expected: zero failed tests.

- [ ] **Step 3: Run static and production checks**

Run:

```bash
npm run typecheck
npm run lint
npm run worker:build
npm run build
git diff --check -- ':!src/generated/**'
```

Expected: every command exits with code 0.

- [ ] **Step 4: Restart and smoke-test the local app**

Start with the same-origin value matching port 3101:

```bash
APP_URL=http://127.0.0.1:3101 npm run dev -- --hostname 127.0.0.1 --port 3101
```

Then verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/login
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3101/api/health/ready
```

Expected: both return `200`.

- [ ] **Step 5: Confirm local-only delivery**

Run:

```bash
git status --short
git log -4 --oneline
```

Expected: the worktree is clean, the feature commits are local, and no push or pull request has been created.
