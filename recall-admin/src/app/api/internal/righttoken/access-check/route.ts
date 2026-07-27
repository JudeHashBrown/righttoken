import { getServerEnv } from "@/lib/env/runtime";
import { createRightTokenAccessCheckHandler } from "@/modules/auth/righttoken-access-handler";
import { findRightTokenMemberForAccess } from "@/modules/auth/righttoken-member";

export const POST = createRightTokenAccessCheckHandler({
  getSecrets() {
    const env = getServerEnv();
    return {
      current: env.INTERNAL_API_SECRET_CURRENT,
      previous: env.INTERNAL_API_SECRET_PREVIOUS
    };
  },
  findMember: findRightTokenMemberForAccess
});
