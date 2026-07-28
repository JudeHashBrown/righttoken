import { describe, expect, it } from "vitest";
import {
  getPublicSegmentFieldRegistry,
  validateClauseForField
} from "@/modules/segmentation/field-registry";

describe("segment field registry", () => {
  it("exposes only the approved user facts", () => {
    const keys = getPublicSegmentFieldRegistry().map(
      (field) => field.key
    );

    expect(keys).toContain("registrationElapsed");
    expect(keys).toContain("countryCode");
    expect(keys).toContain("balanceUsdMinor");
    expect(keys).not.toContain("currentSegment");
    expect(keys).not.toContain("ownerId");
    expect(keys).not.toContain("taskStatus");
  });

  it("rejects a numeric operator for a boolean field", () => {
    expect(() =>
      validateClauseForField({
        field: "anomalyActive",
        operator: "gte",
        value: 1
      })
    ).toThrow(/operator/i);
  });

  it("accepts a relative duration with an approved unit", () => {
    expect(
      validateClauseForField({
        field: "lastCallElapsed",
        operator: "gte",
        value: 7,
        unit: "days"
      })
    ).toEqual({
      field: "lastCallElapsed",
      operator: "gte",
      value: 7,
      unit: "days"
    });
  });

  it("normalizes ISO country values", () => {
    expect(
      validateClauseForField({
        field: "countryCode",
        operator: "in",
        value: ["sg", "us"]
      })
    ).toMatchObject({ value: ["SG", "US"] });
  });
});
