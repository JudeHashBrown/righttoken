import type { UserProfile } from "@/generated/prisma/client";

type OwnerState = Pick<
  UserProfile,
  "ownerAssignmentMode" | "ownerId"
>;

export function isManualOwnerLocked(user: OwnerState): boolean {
  return user.ownerAssignmentMode === "MANUAL" && Boolean(user.ownerId);
}
