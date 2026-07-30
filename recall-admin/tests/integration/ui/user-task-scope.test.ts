import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Member } from "@/generated/prisma/client";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import {
  findTasks,
  getTaskDetail
} from "@/modules/tasks/task-queries";
import {
  findUsers,
  getUser360
} from "@/modules/users/user-queries";

describe("user and task workspace scope", () => {
  const memberIds: string[] = [];
  const userIds: string[] = [];
  let admin: Member;
  let firstOperator: Member;
  let secondOperator: Member;
  let ownedUserId: string;
  let otherUserId: string;
  let publicUserId: string;
  let unrecognizedUserId: string;
  let ownedExternalId: string;
  let ownedEmail: string;
  let publicTaskId: string;
  let otherTaskId: string;

  beforeAll(async () => {
    [admin, firstOperator, secondOperator] = await Promise.all(
      [
        ["ADMIN", "Workspace Admin"],
        ["OPERATOR", "First Operator"],
        ["OPERATOR", "Second Operator"]
      ].map(([role, displayName]) =>
        prisma.member.create({
          data: {
            email: `${randomUUID()}@example.test`,
            displayName,
            passwordHash: "not-used-in-this-test",
            role: role as Member["role"]
          }
        })
      )
    );
    memberIds.push(admin.id, firstOperator.id, secondOperator.id);

    const cipher = createFieldCipher(
      Buffer.from(process.env.APP_ENCRYPTION_KEY!, "base64")
    );
    ownedExternalId = `workspace-owned-${randomUUID()}`;
    ownedEmail = `${ownedExternalId}@example.test`;
    const [ownedUser, otherUser, publicUser, unrecognizedUser] =
      await Promise.all([
      prisma.userProfile.create({
        data: {
          externalUserId: ownedExternalId,
          email: ownedEmail,
          emailNormalized: ownedEmail,
          displayName: "Owned User",
          registeredAt: new Date("2026-07-20T08:00:00.000Z"),
          registrationIpEnc: cipher.encrypt("203.0.113.42"),
          countryCode: "US",
          region: "California",
          source: "righttoken-web",
          currentSegment: "B",
          ownerId: firstOperator.id
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `workspace-other-${randomUUID()}`,
          email: `other-${randomUUID()}@example.test`,
          emailNormalized: `other-${randomUUID()}@example.test`,
          displayName: "Other User",
          registeredAt: new Date("2026-07-21T08:00:00.000Z"),
          countryCode: "CN",
          region: "广东",
          source: "partner",
          currentSegment: "A",
          ownerId: secondOperator.id
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `workspace-public-${randomUUID()}`,
          email: `public-${randomUUID()}@example.test`,
          emailNormalized: `public-${randomUUID()}@example.test`,
          displayName: "Public Pool User",
          registeredAt: new Date("2026-07-22T08:00:00.000Z"),
          countryCode: "SG",
          source: "righttoken-web",
          currentSegment: "C"
        }
      }),
      prisma.userProfile.create({
        data: {
          externalUserId: `workspace-unrecognized-${randomUUID()}`,
          email: `unrecognized-${randomUUID()}@example.test`,
          emailNormalized: `unrecognized-${randomUUID()}@example.test`,
          displayName: "Unrecognized Location User",
          registeredAt: new Date("2026-07-23T08:00:00.000Z"),
          countryCode: null,
          region: null,
          source: "righttoken-web",
          currentSegment: "G"
        }
      })
    ]);
    ownedUserId = ownedUser.id;
    otherUserId = otherUser.id;
    publicUserId = publicUser.id;
    unrecognizedUserId = unrecognizedUser.id;
    userIds.push(
      ownedUserId,
      otherUserId,
      publicUserId,
      unrecognizedUserId
    );

    await prisma.recallTask.createMany({
      data: [
        {
          userId: ownedUserId,
          origin: "MANUAL",
          triggerKey: `workspace-owned-${randomUUID()}`,
          ruleVersion: 1,
          title: "Owned task",
          reason: "Assigned to first operator",
          priority: "IMPORTANT",
          status: "TODO",
          assigneeId: firstOperator.id,
          dueAt: new Date("2026-07-24T09:00:00.000Z")
        },
        {
          userId: otherUserId,
          origin: "MANUAL",
          triggerKey: `workspace-other-${randomUUID()}`,
          ruleVersion: 1,
          title: "Other task",
          reason: "Assigned to second operator",
          priority: "NORMAL",
          status: "TODO",
          assigneeId: secondOperator.id,
          dueAt: new Date("2026-07-24T10:00:00.000Z")
        },
        {
          userId: publicUserId,
          origin: "AUTOMATION",
          triggerKey: `workspace-public-${randomUUID()}`,
          ruleVersion: 1,
          title: "Public task",
          reason: "Available to claim",
          priority: "URGENT",
          status: "UNASSIGNED",
          dueAt: new Date("2026-07-24T08:00:00.000Z")
        }
      ]
    });
    publicTaskId = (
      await prisma.recallTask.findFirstOrThrow({
        where: { userId: publicUserId }
      })
    ).id;
    otherTaskId = (
      await prisma.recallTask.findFirstOrThrow({
        where: { userId: otherUserId }
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.userProfile.deleteMany({
      where: { id: { in: userIds } }
    });
    await prisma.member.deleteMany({
      where: { id: { in: memberIds } }
    });
    await prisma.$disconnect();
  });

  it("limits operator user rows and returns complete email without IP", async () => {
    const page = await findUsers(firstOperator, { pageSize: 20 });

    expect(page.items.map((row) => row.id)).toEqual([ownedUserId]);
    expect(page.items[0]).toMatchObject({
      externalUserId: ownedExternalId,
      email: ownedEmail
    });
    expect(page.items[0]).not.toHaveProperty("registrationIp");
    expect(page.items[0]).not.toHaveProperty("registrationIpEnc");
  });

  it("lets an admin combine filters and paginate all users", async () => {
    const filtered = await findUsers(admin, {
      segments: ["B"],
      countryCode: "US",
      region: "California",
      ownerId: firstOperator.id,
      source: "righttoken-web",
      registeredFrom: new Date("2026-07-19T00:00:00.000Z"),
      registeredTo: new Date("2026-07-21T00:00:00.000Z"),
      search: ownedEmail,
      pageSize: 20
    });
    const firstPage = await findUsers(admin, { pageSize: 1 });
    const secondPage = await findUsers(admin, {
      pageSize: 1,
      cursor: firstPage.nextCursor
    });

    expect(filtered.items.map((row) => row.id)).toEqual([ownedUserId]);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
  });

  it("filters only users whose country and region are both unrecognized", async () => {
    const filtered = await findUsers(admin, {
      locationState: "unrecognized",
      pageSize: 20
    });

    expect(filtered.items.map((row) => row.id)).toEqual([
      unrecognizedUserId
    ]);
    expect(filtered.items).not.toContainEqual(
      expect.objectContaining({ id: publicUserId })
    );
  });

  it("shows full IP only in an authorized User 360 detail", async () => {
    const detail = await getUser360(firstOperator, ownedUserId);
    const forbiddenDetail = await getUser360(
      firstOperator,
      otherUserId
    );
    const adminDetail = await getUser360(admin, otherUserId);

    expect(detail).toMatchObject({
      id: ownedUserId,
      email: ownedEmail,
      registrationIp: "203.0.113.42"
    });
    expect(detail).not.toHaveProperty("registrationIpEnc");
    expect(forbiddenDetail).toBeNull();
    expect(adminDetail?.id).toBe(otherUserId);
  });

  it("shows operators their assigned tasks and the public pool only", async () => {
    const page = await findTasks(firstOperator, { pageSize: 20 });
    const publicDetail = await getTaskDetail(
      firstOperator,
      publicTaskId
    );
    const forbiddenDetail = await getTaskDetail(
      firstOperator,
      otherTaskId
    );
    const workspaceTitles = page.items
      .map((task) => task.title)
      .filter((title) =>
        ["Public task", "Owned task", "Other task"].includes(title)
      );

    expect(workspaceTitles).toEqual([
      "Public task",
      "Owned task"
    ]);
    expect(page.items).not.toContainEqual(
      expect.objectContaining({ title: "Other task" })
    );
    expect(publicDetail).toMatchObject({
      id: publicTaskId,
      user: {
        id: publicUserId,
        email: expect.stringContaining("@example.test")
      }
    });
    expect(forbiddenDetail).toBeNull();
  });
});
