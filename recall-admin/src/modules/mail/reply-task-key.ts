import { createHash } from "node:crypto";

export function replyTriggerKey(
  providerMessageId: string
): string {
  return `email-reply:${createHash("sha256")
    .update(providerMessageId)
    .digest("hex")
    .slice(0, 32)}`;
}
