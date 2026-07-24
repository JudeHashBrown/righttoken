import "server-only";

import { notFound, redirect } from "next/navigation";
import type { Member } from "@/generated/prisma/client";
import { getCurrentMember } from "@/modules/auth/guards";

export async function requireWorkspaceMember(
  nextPath: string
): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
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
