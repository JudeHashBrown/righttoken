import "server-only";

import { notFound } from "next/navigation";
import type { Member } from "@/generated/prisma/client";
import { getCurrentMember } from "@/modules/auth/guards";

export async function requireWorkspaceMember(
  nextPath: string
): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) {
    throw new Error(
      `RightToken identity is unavailable for ${nextPath}`
    );
  }
  return member;
}

export async function requireAdministrator(
  nextPath: string
): Promise<Member> {
  const member = await requireWorkspaceMember(nextPath);
  if (member.role === "OPERATOR") {
    notFound();
  }
  return member;
}
