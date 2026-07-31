import { describe, expect, it } from "vitest";
import {
  mailBatchRequestSchema
} from "@/modules/mail/batch-schema";

const content = {
  mailboxId: "mailbox-1",
  subject: "服务提醒",
  bodyText: "请查看本次服务说明。",
  bodyHtml: "<p>请查看本次服务说明。</p>",
  assets: []
};

describe("mail batch request schema", () => {
  it("accepts one explicit segment", () => {
    expect(
      mailBatchRequestSchema.safeParse({
        ...content,
        mode: "SEGMENT",
        segment: "F"
      }).success
    ).toBe(true);
  });

  it("accepts all users without a segment", () => {
    expect(
      mailBatchRequestSchema.safeParse({
        ...content,
        mode: "ALL"
      }).success
    ).toBe(true);
  });

  it("rejects a segment on all-users mode", () => {
    expect(
      mailBatchRequestSchema.safeParse({
        ...content,
        mode: "ALL",
        segment: "F"
      }).success
    ).toBe(false);
  });

  it("rejects unsupported or multiple segment values", () => {
    expect(
      mailBatchRequestSchema.safeParse({
        ...content,
        mode: "SEGMENT",
        segment: "Z"
      }).success
    ).toBe(false);
    expect(
      mailBatchRequestSchema.safeParse({
        ...content,
        mode: "SEGMENT",
        segment: ["F", "A"]
      }).success
    ).toBe(false);
  });
});
