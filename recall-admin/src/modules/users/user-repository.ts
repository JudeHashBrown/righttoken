import type { UserProfile } from "@/generated/prisma/client";
import type { TransactionClient } from "@/lib/db/transaction";

export async function findUserByExternalId(
  tx: TransactionClient,
  externalUserId: string
): Promise<UserProfile | null> {
  return tx.userProfile.findUnique({
    where: { externalUserId }
  });
}

export async function requireUserByExternalId(
  tx: TransactionClient,
  externalUserId: string
): Promise<UserProfile> {
  const user = await findUserByExternalId(tx, externalUserId);
  if (!user) {
    throw new Error(
      `user ${externalUserId} must be registered before other events`
    );
  }
  return user;
}
