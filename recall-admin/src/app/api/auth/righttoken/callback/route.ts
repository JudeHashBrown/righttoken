import { getServerEnv } from "@/lib/env/runtime";
import { createRightTokenSsoCallbackHandler } from "@/modules/auth/righttoken-callback-handler";
import {
  redeemRightTokenJti,
  resolveRightTokenMember
} from "@/modules/auth/righttoken-member";
import { verifyRightTokenTicket } from "@/modules/auth/righttoken-ticket";
import { createSession } from "@/modules/auth/session";

export const GET = createRightTokenSsoCallbackHandler({
  getConfig() {
    const env = getServerEnv();
    if (
      !env.RIGHTTOKEN_SSO_SECRET ||
      !env.RIGHTTOKEN_ISSUER ||
      !env.RIGHTTOKEN_AUDIENCE
    ) {
      throw new Error("RightToken SSO is not configured");
    }
    return {
      appUrl: env.APP_URL,
      secret: env.RIGHTTOKEN_SSO_SECRET,
      issuer: env.RIGHTTOKEN_ISSUER,
      audience: env.RIGHTTOKEN_AUDIENCE
    };
  },
  verifyTicket: verifyRightTokenTicket,
  resolveMember: resolveRightTokenMember,
  redeemJti: redeemRightTokenJti,
  createSession
});
