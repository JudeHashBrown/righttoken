import { describe, expect, it } from "vitest";
import {
  hashSegmentRuleSet,
  signSegmentPreview,
  verifySegmentPreview
} from "@/modules/segmentation/preview-token";
import { defaultSegmentRuleSet } from "@/modules/segmentation/default-rule-set";

const secret = "preview-token-test-secret-that-is-long-enough";
const now = new Date("2026-07-24T12:00:00.000Z");

describe("segment preview token", () => {
  it("binds a preview to actor, draft hash and expiry", () => {
    const draftHash = hashSegmentRuleSet(defaultSegmentRuleSet);
    const token = signSegmentPreview(
      {
        actorId: "admin-1",
        draftHash,
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString()
      },
      secret
    );

    expect(
      verifySegmentPreview(
        token,
        "admin-1",
        draftHash,
        now,
        secret
      )
    ).toMatchObject({ actorId: "admin-1", draftHash });
  });

  it("rejects a changed draft or expired token", () => {
    const draftHash = hashSegmentRuleSet(defaultSegmentRuleSet);
    const token = signSegmentPreview(
      {
        actorId: "admin-1",
        draftHash,
        expiresAt: new Date(now.getTime() + 60_000).toISOString()
      },
      secret
    );

    expect(() =>
      verifySegmentPreview(
        token,
        "admin-1",
        "changed",
        now,
        secret
      )
    ).toThrow();
    expect(() =>
      verifySegmentPreview(
        token,
        "admin-1",
        draftHash,
        new Date(now.getTime() + 120_000),
        secret
      )
    ).toThrow();
  });
});
