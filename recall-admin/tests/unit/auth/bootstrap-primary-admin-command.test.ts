import { describe, expect, it } from "vitest";
import { runBootstrapPrimaryAdminCommand } from "@/modules/auth/bootstrap-primary-admin-command";

const input = {
  email: "primary@example.test",
  password: "bootstrap-test-password-123",
  displayName: "主管理员"
};

describe("runBootstrapPrimaryAdminCommand", () => {
  it("disconnects the database after a successful bootstrap", async () => {
    const calls: string[] = [];

    const result = await runBootstrapPrimaryAdminCommand(input, {
      async bootstrap() {
        calls.push("bootstrap");
        return { id: "primary-id", created: true };
      },
      async disconnect() {
        calls.push("disconnect");
      }
    });

    expect(result).toEqual({ id: "primary-id", created: true });
    expect(calls).toEqual(["bootstrap", "disconnect"]);
  });

  it("disconnects the database when bootstrap fails", async () => {
    const calls: string[] = [];

    await expect(
      runBootstrapPrimaryAdminCommand(input, {
        async bootstrap() {
          calls.push("bootstrap");
          throw new Error("conflicting primary administrator");
        },
        async disconnect() {
          calls.push("disconnect");
        }
      })
    ).rejects.toThrow("conflicting primary administrator");

    expect(calls).toEqual(["bootstrap", "disconnect"]);
  });
});
