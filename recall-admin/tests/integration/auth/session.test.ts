import "dotenv/config";

import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  createSession,
  findMemberBySessionToken,
  findSessionByToken,
  listMemberSessions,
  markReauthenticated,
  markSecondFactorVerified,
  revokeAllMemberSessions,
  revokeSessionByToken
} from "@/modules/auth/session";

describe("opaque session lifecycle", () => {
  let memberId: string;

  beforeAll(async () => {
    const member = await prisma.member.create({
      data: {
        email: `session-${randomUUID()}@example.test`,
        displayName: "Session Test",
        passwordHash: "not-used-in-this-test",
        role: "OPERATOR"
      }
    });
    memberId = member.id;
  });

  afterAll(async () => {
    if (memberId) {
      await prisma.member.delete({ where: { id: memberId } });
    }
    await prisma.$disconnect();
  });

  it("stores only a token hash, resolves the member, and revokes access", async () => {
    const session = await createSession(memberId);
    const stored = await prisma.session.findUniqueOrThrow({
      where: { id: session.id }
    });

    expect(stored.tokenHash).not.toBe(session.token);
    expect((await findMemberBySessionToken(session.token))?.id).toBe(
      memberId
    );
    expect((await findSessionByToken(session.token))?.session.id).toBe(
      session.id
    );

    await markReauthenticated(session.id);
    const sessions = await listMemberSessions(memberId);
    expect(sessions[0]?.reauthenticatedAt).toBeInstanceOf(Date);

    await revokeSessionByToken(session.token);
    expect(await findMemberBySessionToken(session.token)).toBeNull();
  });

  it("revokes every session except the explicitly retained one", async () => {
    const retained = await createSession(memberId);
    const revoked = await createSession(memberId);

    await expect(
      revokeAllMemberSessions(memberId, retained.id)
    ).resolves.toBe(1);
    expect(await findMemberBySessionToken(retained.token)).not.toBeNull();
    expect(await findMemberBySessionToken(revoked.token)).toBeNull();

    await revokeSessionByToken(retained.token);
  });

  it("does not authorize a second-factor-pending session", async () => {
    const pending = await createSession(memberId, {
      secondFactorRequired: true
    });

    expect(await findSessionByToken(pending.token)).toBeNull();
    expect(
      await findSessionByToken(pending.token, { allowPending: true })
    ).not.toBeNull();

    await markSecondFactorVerified(pending.id);
    expect(await findSessionByToken(pending.token)).not.toBeNull();

    await revokeSessionByToken(pending.token);
  });
});
