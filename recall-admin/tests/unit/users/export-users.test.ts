import { describe, expect, it } from "vitest";
import {
  buildUsersCsv,
  escapeCsvCell
} from "@/modules/users/export-users";

describe("escapeCsvCell", () => {
  it("quotes delimiters and blocks spreadsheet formulas", () => {
    expect(escapeCsvCell("hello,world")).toBe(
      '"hello,world"'
    );
    expect(escapeCsvCell('say "hello"')).toBe(
      '"say ""hello"""'
    );
    expect(escapeCsvCell("=HYPERLINK(\"bad\")")).toBe(
      '"\'=HYPERLINK(""bad"")"'
    );
  });
});

describe("buildUsersCsv", () => {
  it("creates UTF-8 BOM CSV with the operational user fields", () => {
    const csv = buildUsersCsv([
      {
        externalUserId: "42",
        email: "user@example.com",
        displayName: "测试用户",
        currentSegment: "A",
        countryCode: "CN",
        region: "广东",
        ownerName: "运营一号",
        registrationIp: "203.0.113.1",
        registeredAt: new Date("2026-07-26T12:00:00.000Z"),
        firstPaidAt: null,
        totalPaidMinor: 0,
        successfulCallCount: 0,
        lastCallAt: null,
        balanceMinor: 100,
        balanceCurrency: "USD",
        anomalyActive: false,
        updatedAt: new Date("2026-07-26T12:30:00.000Z")
      }
    ]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("external_user_id,email");
    expect(csv).toContain("42,user@example.com,测试用户,A,CN,广东");
    expect(csv).not.toContain("registrationIpEnc");
  });
});
