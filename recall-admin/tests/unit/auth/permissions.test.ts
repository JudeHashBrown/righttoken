import { describe, expect, it } from "vitest";
import { can } from "@/modules/auth/permissions";

describe("role permissions", () => {
  it("allows only the primary admin to export CSV", () => {
    expect(can("PRIMARY_ADMIN", "users:export")).toBe(true);
    expect(can("ADMIN", "users:export")).toBe(false);
    expect(can("OPERATOR", "users:export")).toBe(false);
  });

  it("allows admins to manage operators but not admins", () => {
    expect(can("ADMIN", "operators:manage")).toBe(true);
    expect(can("ADMIN", "admins:manage")).toBe(false);
  });

  it("allows operators to work assigned tasks and send reviewed mail", () => {
    expect(can("OPERATOR", "tasks:work")).toBe(true);
    expect(can("OPERATOR", "mail:send-reviewed")).toBe(true);
    expect(can("OPERATOR", "rules:publish")).toBe(false);
  });
});
