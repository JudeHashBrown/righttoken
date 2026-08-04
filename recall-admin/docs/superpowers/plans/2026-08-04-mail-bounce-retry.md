# Mail Bounce Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize safely matched final DSN failures, release only those messages from the 24-hour guard, expose a semicolon-delimited actionable bounce list, and create throttled in-system retry batches with preserved history.

**Architecture:** Add immutable delivery events plus explicit `BOUNCED` states, parse and match DSNs in focused modules, and apply all related message/task/batch changes in one idempotent transaction. Model retries as recipient-level lineage under the original batch so the UI can always derive the latest actionable leaf without mutating history.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7/PostgreSQL, mailparser/IMAP, Vitest/Testing Library, pg-boss worker.

## Global Constraints

- Only a safely matched DSN field exactly equal to `Action: failed` may change a sent message to `BOUNCED` and release the 24-hour guard.
- `Action: delayed` must preserve `SENT` and the 24-hour guard.
- Unmatched or ambiguous DSNs must be stored as `UNMATCHED` and must not alter outbound state.
- Preserve original messages, conversations, content, assets, batches, and audit history.
- Actionable copied addresses use ASCII `;` with no spaces and stable ascending normalized-email order.
- Bounce retries require an operator confirmation, retain the original mailbox/content/assets and bounced address snapshot, and use the existing domain-wide random 2–4 minute throttle.
- Immediate SMTP failures, delayed DSNs, unsubscribed/paused users, 24-hour skips, internal errors, and unmatched DSNs are not part of the final-bounce list.
- Do not add a force-send or approval-flow bypass.
- No GitHub push without an explicit user instruction.

---

## File Structure

- `prisma/schema.prisma` and `prisma/migrations/20260804150000_add_mail_delivery_events/migration.sql`: delivery-event, bounce-state, and retry-lineage persistence.
- `src/modules/mail/delivery-status.ts`: pure DSN parsing and normalization only.
- `src/modules/mail/delivery-status-matcher.ts`: pure, conservative outbound-candidate matching only.
- `src/modules/mail/apply-delivery-status.ts`: idempotent transaction that records events and updates message, task, recipient, batch, and audit state.
- `src/modules/mail/sync-mailbox.ts`: orchestration that routes DSNs before ordinary reply processing.
- `src/modules/mail/latest-outbound-contact.ts`: single source of truth for the latest actual outbound attempt used by both send paths.
- `src/modules/mail/create-bounce-retry-batch.ts`: permission checks, lineage leaf selection, idempotent child-batch creation, and scheduling.
- `src/modules/mail/mail-batch-query.ts`: authorized lineage summary and actionable address projection.
- `src/app/api/mail/batches/[id]/bounce-retry/route.ts`: CSRF-protected retry endpoint.
- `src/components/mail/mail-batch-list.tsx`: expandable final-bounce list, copy action, and confirmation dialog.
- `src/modules/mail/compose-context.ts`, `src/modules/mail/workspace-filter.ts`, `src/app/(dashboard)/mail/page.tsx`: safe bounced-message prefill for individual retries.
- `src/components/mail/mail-workbench.tsx` and `src/components/tasks/task-actions.tsx`: bounced diagnostics and individual retry entry points.

### Task 1: Persist delivery events, bounce state, and retry lineage

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260804150000_add_mail_delivery_events/migration.sql`
- Modify: `tests/integration/mail/schema.test.ts`
- Create: `tests/integration/mail/mail-delivery-event-migration.test.ts`

**Interfaces:**
- Produces: `MailDeliveryAction`, `MailMessageStatus.BOUNCED`, `MailBatchRecipientStatus.BOUNCED`, `MailDeliveryEvent`, `MailMessage.bouncedAt/bounceStatusCode/bounceDiagnostic`, `MailBatch.retryRootBatchId`, and `MailBatchRecipient.retryOfRecipientId/bouncedAt/bounceStatusCode/bounceDiagnostic`.
- Consumes: existing `Mailbox`, `MailMessage`, `MailBatch`, and `MailBatchRecipient` primary keys.

- [ ] **Step 1: Write the failing schema tests**

```ts
it("stores idempotent delivery events and bounce metadata", async () => {
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT "column_name" FROM "information_schema"."columns"
    WHERE "table_schema" = 'recall' AND "table_name" = 'MailDeliveryEvent'
  `;
  expect(columns.map((row) => row.column_name)).toEqual(
    expect.arrayContaining([
      "inboundProviderMessageId", "outboundMessageId", "action",
      "recipientNormalized", "statusCode", "diagnosticCode", "reportedAt"
    ])
  );
});

it("adds bounced states without changing historical rows", async () => {
  const values = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT "enumlabel" FROM "pg_enum"
    JOIN "pg_type" ON "pg_type"."oid" = "pg_enum"."enumtypid"
    WHERE "pg_type"."typname" IN ('MailMessageStatus', 'MailBatchRecipientStatus')
  `;
  expect(values.filter((row) => row.enumlabel === "BOUNCED")).toHaveLength(2);
});
```

- [ ] **Step 2: Run the focused integration tests and verify RED**

Run: `npm run test:integration -- tests/integration/mail/schema.test.ts tests/integration/mail/mail-delivery-event-migration.test.ts`

Expected: FAIL because the table, enum values, and columns do not exist.

- [ ] **Step 3: Add the Prisma model and migration**

```prisma
enum MailDeliveryAction {
  FAILED
  DELAYED
  DELIVERED
  OTHER
  @@schema("recall")
}

model MailDeliveryEvent {
  id                       String             @id @default(cuid())
  mailboxId                String
  outboundMessageId        String
  inboundProviderMessageId String
  action                   MailDeliveryAction
  recipientNormalized      String
  statusCode               String?
  diagnosticCode           String?
  reportedAt               DateTime
  createdAt                DateTime           @default(now())
  mailbox                  Mailbox            @relation(fields: [mailboxId], references: [id], onDelete: Cascade)
  outboundMessage          MailMessage        @relation(fields: [outboundMessageId], references: [id], onDelete: Cascade)
  @@unique([inboundProviderMessageId, recipientNormalized, action])
  @@index([outboundMessageId, reportedAt])
  @@schema("recall")
}
```

Add `BOUNCED` to both existing status enums; add the bounce fields and `deliveryEvents` relation to `MailMessage`; add `deliveryEvents` to `Mailbox`; add the self-relations named `MailBatchRetryRoot` and `MailRecipientRetry`. Use `onDelete: Restrict` for retry lineage so history cannot be silently severed.

- [ ] **Step 4: Generate Prisma and run the focused tests**

Run: `npx prisma generate && npm run test:integration -- tests/integration/mail/schema.test.ts tests/integration/mail/mail-delivery-event-migration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260804150000_add_mail_delivery_events/migration.sql tests/integration/mail/schema.test.ts tests/integration/mail/mail-delivery-event-migration.test.ts src/generated/prisma
git commit -m "feat: persist mail delivery events"
```

### Task 2: Parse DSN recipient blocks without free-text guessing

**Files:**
- Create: `src/modules/mail/delivery-status.ts`
- Modify: `src/modules/mail/types.ts`
- Modify: `src/modules/mail/adapters/smtp-imap.ts`
- Create: `tests/unit/mail/delivery-status.test.ts`
- Modify: `tests/unit/mail/smtp-imap.test.ts`

**Interfaces:**
- Produces: `parseDeliveryStatus(message: MailboxMessage): ParsedDeliveryStatus | null` where each recipient has `action`, `recipientNormalized`, `statusCode`, `diagnosticCode`, and optional `originalMessageId`.
- Consumes: `MailboxMessage.attachments` containing `message/delivery-status` and optional `message/rfc822` content.

- [ ] **Step 1: Write parser tests for standard, fallback, delayed, and non-DSN mail**

```ts
function messageWithDeliveryStatus(content: string): MailboxMessage {
  return {
    providerMessageId: "<dsn-1@example.test>", inReplyTo: null, references: [],
    fromAddress: "mailer-daemon@example.test", toAddresses: ["support@righttoken.test"],
    subject: "Delivery Status Notification", bodyText: "", bodyHtml: null,
    attachments: [{ fileName: "delivery-status.txt", contentType: "message/delivery-status", content: Buffer.from(content), cid: null, disposition: "ATTACHMENT" }],
    receivedAt: new Date("2026-08-04T08:00:00Z")
  };
}
function ordinaryMessage(subject: string): MailboxMessage {
  return { ...messageWithDeliveryStatus(""), subject, attachments: [], bodyText: "ordinary body" };
}

it("parses exact action fields from delivery-status blocks", () => {
  const parsed = parseDeliveryStatus(messageWithDeliveryStatus(`
Final-Recipient: rfc822; Bad.User@Example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 mailbox unavailable
Original-Message-ID: <outbound-1@example.test>
`));
  expect(parsed?.recipients).toEqual([{
    action: "FAILED",
    recipientNormalized: "bad.user@example.com",
    statusCode: "5.1.1",
    diagnosticCode: "smtp; 550 mailbox unavailable",
    originalMessageId: "<outbound-1@example.test>"
  }]);
});

it("does not classify a failure-looking subject without Action", () => {
  expect(parseDeliveryStatus(ordinaryMessage("Mail delivery failed"))).toBeNull();
});
```

Also assert multiple recipient blocks, `Action: delayed`, field folding, a body-text compatibility block with an explicit `Action:` line, and a 2,000-character diagnostic truncation.

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npm test -- tests/unit/mail/delivery-status.test.ts tests/unit/mail/smtp-imap.test.ts`

Expected: FAIL because `parseDeliveryStatus` and preserved DSN parts do not exist.

- [ ] **Step 3: Implement the pure parser and preserve DSN MIME parts**

```ts
export type DeliveryStatusRecipient = {
  action: "FAILED" | "DELAYED" | "DELIVERED" | "OTHER";
  recipientNormalized: string;
  statusCode: string | null;
  diagnosticCode: string | null;
  originalMessageId: string | null;
};

export type ParsedDeliveryStatus = {
  inboundProviderMessageId: string;
  reportedAt: Date;
  recipients: DeliveryStatusRecipient[];
};

function explicitActionBlocks(bodyText: string): string[];
function parseRecipientBlocks(source: string): DeliveryStatusRecipient[];

export function parseDeliveryStatus(
  message: MailboxMessage
): ParsedDeliveryStatus | null {
  const parts = message.attachments
    .filter((part) => part.contentType.toLowerCase() === "message/delivery-status")
    .map((part) => part.content.toString("utf8"));
  const sources = parts.length ? parts : explicitActionBlocks(message.bodyText);
  const recipients = sources.flatMap(parseRecipientBlocks);
  return recipients.length
    ? { inboundProviderMessageId: message.providerMessageId, reportedAt: message.receivedAt, recipients }
    : null;
}
```

Call `simpleParser(source, { skipHtmlToText: true, skipTextToHtml: true, keepDeliveryStatus: true })`. Preserve `message/delivery-status` and `message/rfc822` attachments in `MailboxMessage`; do not classify using subject text.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `npm test -- tests/unit/mail/delivery-status.test.ts tests/unit/mail/smtp-imap.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/mail/delivery-status.ts src/modules/mail/types.ts src/modules/mail/adapters/smtp-imap.ts tests/unit/mail/delivery-status.test.ts tests/unit/mail/smtp-imap.test.ts
git commit -m "feat: parse mail delivery status notifications"
```

### Task 3: Match DSNs conservatively to outbound messages

**Files:**
- Create: `src/modules/mail/delivery-status-matcher.ts`
- Create: `tests/unit/mail/delivery-status-matcher.test.ts`

**Interfaces:**
- Consumes: `DeliveryStatusRecipient` and `OutboundDeliveryCandidate`.
- Produces: `matchDeliveryStatusRecipient(input, candidates): { kind: "MATCHED"; messageId: string } | { kind: "UNMATCHED"; reason: string }`.

- [ ] **Step 1: Write matching precedence and ambiguity tests**

```ts
const failedRecipient: DeliveryStatusRecipient = {
  action: "FAILED", recipientNormalized: "user@example.test",
  statusCode: "5.1.1", diagnosticCode: "smtp; 550 rejected",
  originalMessageId: null
};
function candidate(messageId: string, providerMessageId: string | null): OutboundDeliveryCandidate {
  return {
    messageId, providerMessageId, mailboxId: "mailbox-1",
    recipientNormalized: "user@example.test", normalizedSubject: "subject",
    sentAt: new Date("2026-08-04T07:00:00Z")
  };
}

it("prefers an exact normalized original message id", () => {
  expect(matchDeliveryStatusRecipient(
    { ...failedRecipient, originalMessageId: " outbound-1@example.test " },
    [candidate("message-1", "<outbound-1@example.test>")]
  )).toEqual({ kind: "MATCHED", messageId: "message-1" });
});

it("rejects ambiguous recipient-subject fallback", () => {
  expect(matchDeliveryStatusRecipient(
    { ...failedRecipient, originalMessageId: null },
    [candidate("one", null), candidate("two", null)]
  )).toEqual({ kind: "UNMATCHED", reason: "AMBIGUOUS_DELIVERY_STATUS" });
});
```

Cover `Original-Message-ID`, DSN `In-Reply-To`/`References`, unique same-mailbox + same-recipient + normalized-subject + 30-day fallback, and rejection outside 30 days.

- [ ] **Step 2: Run matcher tests and verify RED**

Run: `npm test -- tests/unit/mail/delivery-status-matcher.test.ts`

Expected: FAIL because the matcher does not exist.

- [ ] **Step 3: Implement deterministic matching**

```ts
export type OutboundDeliveryCandidate = {
  messageId: string;
  providerMessageId: string | null;
  mailboxId: string;
  recipientNormalized: string;
  normalizedSubject: string;
  sentAt: Date;
};

export function normalizeMessageId(value: string | null): string | null {
  const normalized = value?.trim().replace(/^<|>$/g, "").toLowerCase();
  return normalized || null;
}
```

Implement the three precedence levels exactly as specified. Return a reason code instead of selecting the first candidate whenever a level produces more than one candidate.

- [ ] **Step 4: Run matcher tests and verify GREEN**

Run: `npm test -- tests/unit/mail/delivery-status-matcher.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/mail/delivery-status-matcher.ts tests/unit/mail/delivery-status-matcher.test.ts
git commit -m "feat: match delivery statuses safely"
```

### Task 4: Apply delivery events atomically and route them through mailbox sync

**Files:**
- Create: `src/modules/mail/apply-delivery-status.ts`
- Modify: `src/modules/mail/sync-mailbox.ts`
- Create: `tests/integration/mail/mail-bounce-sync.test.ts`
- Modify: `tests/integration/mail/reply-sync.test.ts`
- Modify: `tests/integration/worker/mail-sync.test.ts`

**Interfaces:**
- Consumes: `ParsedDeliveryStatus`, matcher result, Prisma transaction.
- Produces: `applyDeliveryStatus(tx, input): Promise<{ action; changed; unmatchedReason? }>` and sync counters `deliveryEvents`, `finalBounces`, `delayedDeliveries`, `unmatchedBounces`.

- [ ] **Step 1: Write integration tests for failed, delayed, unmatched, duplicate, and task safety**

```ts
it("marks a safely matched failed DSN as bounced exactly once", async () => {
  const failedDsn = buildDsnMailboxMessage({ action: "failed", originalMessageId: providerMessageId });
  const adapter = { listMessagesSince: vi.fn().mockResolvedValue([failedDsn]) };
  const first = await syncMailbox(mailboxId, adapter, version, now);
  const second = await syncMailbox(mailboxId, adapter, version, now);
  expect(first.finalBounces).toBe(1);
  expect(second.finalBounces).toBe(0);
  await expect(prisma.mailMessage.findUniqueOrThrow({ where: { id: outboundId } }))
    .resolves.toMatchObject({ status: "BOUNCED", bounceStatusCode: "5.1.1" });
  await expect(prisma.mailDeliveryEvent.count({ where: { outboundMessageId: outboundId } }))
    .resolves.toBe(1);
});

it("keeps delayed delivery sent and guarded", async () => {
  const delayedDsn = buildDsnMailboxMessage({ action: "delayed", originalMessageId: providerMessageId });
  await syncMailbox(mailboxId, { listMessagesSince: vi.fn().mockResolvedValue([delayedDsn]) }, version, now);
  await expect(prisma.mailMessage.findUniqueOrThrow({ where: { id: outboundId } }))
    .resolves.toMatchObject({ status: "SENT", bouncedAt: null });
});
```

Define `buildDsnMailboxMessage` in the test as a complete `MailboxMessage` fixture with a `message/delivery-status` attachment, using the Task 2 shape. Also assert `SENT -> BOUNCED` changes batch counts only once, terminal batch status converges, recognized DSNs do not create reply tasks, unmatched DSNs create `UNMATCHED` plus a `MAIL_BOUNCE_UNMATCHED` audit, and only the newest outbound message can reopen a `WAITING_USER` task.

- [ ] **Step 2: Run sync integration tests and verify RED**

Run: `npm run test:integration -- tests/integration/mail/mail-bounce-sync.test.ts tests/integration/mail/reply-sync.test.ts tests/integration/worker/mail-sync.test.ts`

Expected: FAIL because delivery events are still processed as ordinary replies.

- [ ] **Step 3: Implement the idempotent transaction**

```ts
export async function applyDeliveryStatus(
  tx: Prisma.TransactionClient,
  input: ApplyDeliveryStatusInput
): Promise<ApplyDeliveryStatusResult> {
  const event = await createDeliveryEventIfAbsent(tx, input);
  if (!event.created || input.recipient.action !== "FAILED") {
    return { action: input.recipient.action, changed: false };
  }
  const changed = await tx.mailMessage.updateMany({
    where: { id: input.outboundMessageId, status: "SENT" },
    data: {
      status: "BOUNCED",
      bouncedAt: input.reportedAt,
      bounceStatusCode: input.recipient.statusCode,
      bounceDiagnostic: input.recipient.diagnosticCode,
      lastErrorCode: "FINAL_BOUNCE"
    }
  });
  if (changed.count === 0) return { action: "FAILED", changed: false };
  await updateBatchRecipientAndCounts(tx, input);
  await reopenWaitingTaskOnlyIfMessageIsLatest(tx, input);
  await writeBounceAudit(tx, input);
  return { action: "FAILED", changed: true };
}
```

Define the four private helpers used above in this file with these signatures: `createDeliveryEventIfAbsent(tx, input): Promise<{ created: boolean }>`, `updateBatchRecipientAndCounts(tx, input): Promise<void>`, `reopenWaitingTaskOnlyIfMessageIsLatest(tx, input): Promise<void>`, and `writeBounceAudit(tx, input): Promise<void>`. `writeBounceAudit` writes `MAIL_FINAL_BOUNCE_MATCHED` only for the first `SENT -> BOUNCED` transition. In `syncMailbox`, query inbound IDs from both `MailMessage` and `MailDeliveryEvent`, parse DSNs before preparing ordinary inbound assets, and route recognized DSNs to the matcher/applicator. Store unmatched DSNs as `UNMATCHED`, write `MAIL_BOUNCE_UNMATCHED`, and continue the existing reply path unchanged for non-DSNs.

- [ ] **Step 4: Run sync tests and verify GREEN**

Run: `npm run test:integration -- tests/integration/mail/mail-bounce-sync.test.ts tests/integration/mail/reply-sync.test.ts tests/integration/worker/mail-sync.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/mail/apply-delivery-status.ts src/modules/mail/sync-mailbox.ts tests/integration/mail/mail-bounce-sync.test.ts tests/integration/mail/reply-sync.test.ts tests/integration/worker/mail-sync.test.ts
git commit -m "feat: apply final mail bounces during sync"
```

### Task 5: Make the 24-hour guard use the latest actual outbound attempt

**Files:**
- Create: `src/modules/mail/latest-outbound-contact.ts`
- Modify: `src/modules/mail/send-guard.ts`
- Modify: `src/modules/mail/send-reviewed-mail.ts`
- Modify: `src/modules/mail/reply-to-thread.ts`
- Modify: `tests/unit/mail/send-guard.test.ts`
- Modify: `tests/integration/mail/reviewed-send.test.ts`
- Modify: `tests/integration/mail/thread-reply.test.ts`

**Interfaces:**
- Produces: `findLatestOutboundContact(userId): Promise<{ status: "SENT" | "BOUNCED"; sentAt: Date } | null>`.
- Consumes: latest outbound row ordered by `sentAt DESC, createdAt DESC` with status in `SENT | BOUNCED`.

- [ ] **Step 1: Write guard tests for SENT, BOUNCED, and re-send**

```ts
const recentSent = { status: "SENT" as const, sentAt: new Date("2026-07-24T09:00:00Z") };
const recentBounce = { status: "BOUNCED" as const, sentAt: new Date("2026-07-24T09:00:00Z") };

expect(() => assertMailSendAllowed(user, { ...draft, latestOutbound: recentSent }, now))
  .toThrowError(expect.objectContaining({ code: "CONTACT_FREQUENCY_LIMIT" }));
expect(() => assertMailSendAllowed(user, { ...draft, latestOutbound: recentBounce }, now))
  .not.toThrow();
```

Integration coverage must prove an older `SENT` does not block when the latest attempt is `BOUNCED`, and a newly accepted retry immediately becomes the new guarding `SENT`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/unit/mail/send-guard.test.ts && npm run test:integration -- tests/integration/mail/reviewed-send.test.ts tests/integration/mail/thread-reply.test.ts`

Expected: FAIL because the guard only receives `lastSentAt`.

- [ ] **Step 3: Implement the shared latest-attempt query and guard contract**

```ts
export type LatestOutboundContact = {
  status: "SENT" | "BOUNCED";
  sentAt: Date;
};

if (
  draft.latestOutbound?.status === "SENT" &&
  draft.minimumContactIntervalMinutes > 0 &&
  now.getTime() - draft.latestOutbound.sentAt.getTime() <
    draft.minimumContactIntervalMinutes * 60_000
) {
  throw new MailSendBlockedError("CONTACT_FREQUENCY_LIMIT");
}
```

Use the helper in both `sendReviewedMail` and `replyToMailThread`; remove the duplicated `status: "SENT"` queries and the `lastSentAt` contract.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/unit/mail/send-guard.test.ts && npm run test:integration -- tests/integration/mail/reviewed-send.test.ts tests/integration/mail/thread-reply.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/mail/latest-outbound-contact.ts src/modules/mail/send-guard.ts src/modules/mail/send-reviewed-mail.ts src/modules/mail/reply-to-thread.ts tests/unit/mail/send-guard.test.ts tests/integration/mail/reviewed-send.test.ts tests/integration/mail/thread-reply.test.ts
git commit -m "feat: release bounced mail from contact guard"
```

### Task 6: Query actionable bounce leaves and create child retry batches

**Files:**
- Modify: `src/modules/mail/mail-batch-query.ts`
- Create: `src/modules/mail/create-bounce-retry-batch.ts`
- Create: `src/app/api/mail/batches/[id]/bounce-retry/route.ts`
- Modify: `tests/integration/mail/mail-batch-query.test.ts`
- Create: `tests/integration/mail/create-bounce-retry-batch.test.ts`
- Modify: `tests/unit/api/mail-batch-routes.test.ts`

**Interfaces:**
- Produces: `getActionableBounceLeaves(tx, rootBatchId)` sorted by `emailNormalized`; `createBounceRetryBatch({ actorId, batchId, idempotencyKey, scheduler, now })`; batch summary fields `actionableBounceCount` and `actionableBounceEmails`.
- Consumes: `retryRootBatchId`, `retryOfRecipientId`, original batch content/assets, existing `TaskScheduler.scheduleMailBatch`.

- [ ] **Step 1: Write query, service, permission, and route tests**

```ts
expect(summary.actionableBounceEmails).toEqual([
  "a@example.test", "z@example.test"
]);
expect(summary.actionableBounceList).toBe(
  "a@example.test;z@example.test"
);

const retry = await createBounceRetryBatch({
  actorId, batchId: rootBatchId, idempotencyKey: "retry-key-1", scheduler, now
});
expect(retry).toMatchObject({ retryRootBatchId: rootBatchId, totalRecipients: 2 });
```

Assert that content, mailbox, assets, and address snapshots are inherited; each child has `retryOfRecipientId`; double-click/concurrent calls do not duplicate a leaf; a second final bounce becomes actionable again; disabled/deleted mailbox returns `MAILBOX_DISABLED`; zero leaves returns `NO_ACTIONABLE_BOUNCES`; operator scope matches normal batch-send permission.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test:integration -- tests/integration/mail/mail-batch-query.test.ts tests/integration/mail/create-bounce-retry-batch.test.ts && npm test -- tests/unit/api/mail-batch-routes.test.ts`

Expected: FAIL because lineage queries, service, and route do not exist.

- [ ] **Step 3: Implement leaf projection and transactional retry creation**

```ts
export type ActionableBounceLeaf = {
  recipientId: string;
  userId: string;
  emailNormalized: string;
  taskId: string | null;
};

export async function createBounceRetryBatch(input: CreateBounceRetryBatchInput) {
  const result = await prisma.$transaction(async (tx) => {
    const root = await loadAuthorizedRootBatch(tx, input.actorId, input.batchId);
    const existing = await tx.mailBatch.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { batch: existing, created: false };
    const leaves = await getActionableBounceLeaves(tx, root.id);
    if (!leaves.length) throw new NoActionableBouncesError();
    return createRetryBatchWithRecipientLinks(tx, root, leaves, input);
  });
  if (result.created) await input.scheduler.scheduleMailBatch?.({ batchId: result.batch.id });
  return result.batch;
}
```

Define `loadAuthorizedRootBatch`, `getActionableBounceLeaves`, and `createRetryBatchWithRecipientLinks` in the same module with the exact return types declared in **Interfaces**. `createRetryBatchWithRecipientLinks` must clone batch-asset relations, create recipients with `retryOfRecipientId`, and write `MAIL_BOUNCE_RETRY_BATCH_CREATED` in the same transaction.

The route reads `idempotency-key`, applies `assertSameOrigin`, maps domain errors to stable 400/404/409 responses, and never accepts mailbox/body/recipient overrides from the client.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm run test:integration -- tests/integration/mail/mail-batch-query.test.ts tests/integration/mail/create-bounce-retry-batch.test.ts && npm test -- tests/unit/api/mail-batch-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/mail/mail-batch-query.ts src/modules/mail/create-bounce-retry-batch.ts 'src/app/api/mail/batches/[id]/bounce-retry/route.ts' tests/integration/mail/mail-batch-query.test.ts tests/integration/mail/create-bounce-retry-batch.test.ts tests/unit/api/mail-batch-routes.test.ts
git commit -m "feat: create retry batches for final bounces"
```

### Task 7: Add final-bounce list, copy, and confirmed retry UI

**Files:**
- Modify: `src/components/mail/mail-batch-list.tsx`
- Modify: `src/components/workspaces/workspace.module.css`
- Modify: `tests/unit/components/mail-batch-list.test.tsx`

**Interfaces:**
- Consumes: `GET /api/mail/batches/:id` fields `actionableBounceCount`, `actionableBounceEmails`, `actionableBounceList`; `POST /api/mail/batches/:id/bounce-retry` with `idempotency-key`.
- Produces: accessible expanded detail, clipboard action, and a second-confirmation retry dialog.

- [ ] **Step 1: Write component tests for list scope, copy, confirmation, and retry**

```tsx
fireEvent.click(screen.getByRole("button", { name: "查看最终退信" }));
expect(await screen.findByText("a@example.test;z@example.test")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "复制邮箱列表" }));
expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
  "a@example.test;z@example.test"
);
fireEvent.click(screen.getByRole("button", { name: "重新发送退信用户" }));
expect(screen.getByRole("dialog")).toHaveTextContent("每封 2–4 分钟随机间隔");
```

Assert that immediate `failedRecipients` still shows the existing “重试失败项” control, while the final-bounce action depends only on `actionableBounceCount`.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- tests/unit/components/mail-batch-list.test.tsx`

Expected: FAIL because final-bounce controls do not exist.

- [ ] **Step 3: Implement the UI state machine**

```ts
type BounceSummary = {
  actionableBounceCount: number;
  actionableBounceEmails: string[];
  actionableBounceList: string;
};

async function confirmBounceRetry(batchId: string): Promise<void> {
  const key = crypto.randomUUID();
  const response = await fetch(`/api/mail/batches/${encodeURIComponent(batchId)}/bounce-retry`, {
    method: "POST",
    headers: { "idempotency-key": key }
  });
  if (!response.ok) throw new Error("BOUNCE_RETRY_FAILED");
  setConfirmingId(null);
  router.refresh();
}
```

Use a real `role="dialog"` with cancel/confirm buttons. Display sender mailbox and subject returned by the detail API, the exact count, and throttle disclosure. Provide visible success/error feedback for clipboard and retry operations.

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `npm test -- tests/unit/components/mail-batch-list.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/mail/mail-batch-list.tsx src/components/workspaces/workspace.module.css tests/unit/components/mail-batch-list.test.tsx
git commit -m "feat: manage final bounces in mail batches"
```

### Task 8: Show individual bounce diagnostics and prefill a safe manual retry

**Files:**
- Modify: `src/modules/mail/workspace-filter.ts`
- Modify: `src/modules/mail/compose-context.ts`
- Modify: `src/modules/mail/compose-link.ts`
- Modify: `src/modules/mail/workspace-query.ts`
- Modify: `src/app/(dashboard)/mail/page.tsx`
- Modify: `src/components/mail/mail-workbench.tsx`
- Modify: `src/components/tasks/task-actions.tsx`
- Modify: `tests/unit/mail/workspace-filter.test.ts`
- Modify: `tests/integration/mail/compose-context.test.ts`
- Modify: `tests/integration/mail/workspace-query.test.ts`
- Modify: `tests/unit/components/mail-workbench.test.tsx`

**Interfaces:**
- Produces: optional `retryMessageId` compose parameter, authorized compose prefill `{ subject, bodyText, bodyHtml, assets }` only for a `BOUNCED` outbound message belonging to the selected user/task, and `MailComposer` prop `initialContent?: MailRichContent`.
- Consumes: bounce metadata from `MailMessage` and existing mail composer.

- [ ] **Step 1: Write authorization, display, and prefill tests**

```ts
expect(parseMailWorkspaceFilter({ compose: "1", retryMessageId: "message-1" }))
  .toMatchObject({ composeRetryMessageId: "message-1" });

expect(await getComposeContext(viewer, {
  userId, taskId, retryMessageId: bouncedMessageId
})).toMatchObject({
  retryMessage: { subject: "原主题", bodyHtml: "<p>原正文</p>" }
});
```

Assert no prefill for `SENT`, another user, an out-of-scope operator, or a different task. UI tests assert “最终退信”, status code/diagnostic, and “重新编辑并发送”.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/unit/mail/workspace-filter.test.ts tests/unit/components/mail-workbench.test.tsx && npm run test:integration -- tests/integration/mail/compose-context.test.ts tests/integration/mail/workspace-query.test.ts`

Expected: FAIL because bounced messages are neither selected nor prefetched.

- [ ] **Step 3: Implement authorized prefill and presentation**

```ts
export function mailComposeHref(input: {
  userId: string;
  taskId?: string | null;
  retryMessageId?: string | null;
  view?: string;
}): string {
  const params = new URLSearchParams({ view: input.view ?? "failed", compose: "1", userId: input.userId });
  if (input.taskId) params.set("taskId", input.taskId);
  if (input.retryMessageId) params.set("retryMessageId", input.retryMessageId);
  return `/mail?${params.toString()}`;
}
```

Query `BOUNCED` in the failed workspace view, include safe bounce fields in selected message/thread payloads, add `initialContent?: MailRichContent` to `MailComposer`, and pass authorized retry content without converting it through plain text. The send still uses the normal `/api/mail/send` path and all current safety checks.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/unit/mail/workspace-filter.test.ts tests/unit/components/mail-workbench.test.tsx && npm run test:integration -- tests/integration/mail/compose-context.test.ts tests/integration/mail/workspace-query.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/mail/workspace-filter.ts src/modules/mail/compose-context.ts src/modules/mail/compose-link.ts src/modules/mail/workspace-query.ts 'src/app/(dashboard)/mail/page.tsx' src/components/mail/mail-workbench.tsx src/components/tasks/task-actions.tsx tests/unit/mail/workspace-filter.test.ts tests/integration/mail/compose-context.test.ts tests/integration/mail/workspace-query.test.ts tests/unit/components/mail-workbench.test.tsx
git commit -m "feat: retry individual bounced mail"
```

### Task 9: Run complete regression and production verification

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: all completed bounce-retry tasks.
- Produces: verified migration, worker bundle, web build, and regression suite.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: all unit test files PASS.

- [ ] **Step 2: Run all integration tests**

Run: `npm run test:integration`

Expected: all integration test files PASS.

- [ ] **Step 3: Run static checks and both production bundles**

Run: `npm run lint && npm run typecheck && npm run worker:build && npm run build`

Expected: all commands exit 0.

- [ ] **Step 4: Run focused browser smoke checks on localhost**

Run the web and worker with the required local environment, then verify: a seeded `failed` DSN changes only the matched message; `delayed` stays guarded; the batch detail copies `a@example.test;z@example.test`; confirmation creates one child batch; the child is paced by the existing throttle; an individual bounce opens a prefilled composer.

Expected: no console errors, no duplicate retry batch, and no ordinary reply task created for DSNs.

- [ ] **Step 5: Review the final diff against the design and commit any verification-only fix**

```bash
git status --short
git diff --check
git log --oneline --max-count=12
```

Expected: clean worktree after all intentional commits; do not push.
