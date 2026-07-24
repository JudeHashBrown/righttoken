import "dotenv/config";

import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

describe("mail domain schema", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("exposes mailbox, thread, message, template and suppression storage", async () => {
    const [mailboxes, threads, messages, templates, suppressions] =
      await Promise.all([
        prisma.mailbox.count(),
        prisma.mailThread.count(),
        prisma.mailMessage.count(),
        prisma.mailTemplate.count(),
        prisma.suppressionEntry.count()
      ]);

    expect({
      mailboxes,
      threads,
      messages,
      templates,
      suppressions
    }).toEqual({
      mailboxes: expect.any(Number),
      threads: expect.any(Number),
      messages: expect.any(Number),
      templates: expect.any(Number),
      suppressions: expect.any(Number)
    });
  });
});
