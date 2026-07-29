import { describe, expect, it } from "vitest";
import {
  mailComposeHref
} from "@/modules/mail/compose-link";

describe("mail compose link", () => {
  it("encodes user and task identifiers in stable order", () => {
    expect(
      mailComposeHref({
        userId: "user/a",
        taskId: "task?1",
        view: "replies"
      })
    ).toBe(
      "/mail?view=replies&compose=1&userId=user%2Fa&taskId=task%3F1"
    );
  });
});
