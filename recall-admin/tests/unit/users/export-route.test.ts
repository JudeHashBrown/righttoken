import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  ForbiddenError,
  UnauthorizedError
} from "@/modules/auth/authorization";
import { createUserExportHandler } from "@/modules/users/export-handler";

const request = new NextRequest(
  "https://recall.righttoken.ai/api/users/export"
);

describe("user CSV export route", () => {
  it("returns CSV for a primary administrator", async () => {
    const handler = createUserExportHandler({
      requireExportPermission: async () => ({
        memberId: "primary-1"
      }),
      exportCsv: async () => "\uFEFFexternal_user_id\n42\n"
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "text/csv"
    );
    expect(response.headers.get("content-disposition")).toContain(
      "righttoken-users-"
    );
  });

  it.each([
    ["administrator", new ForbiddenError("users:export"), 403],
    ["operator", new ForbiddenError("users:export"), 403],
    ["anonymous", new UnauthorizedError(), 401]
  ])("denies %s export", async (_label, error, status) => {
    const handler = createUserExportHandler({
      requireExportPermission: async () => {
        throw error;
      },
      exportCsv: async () => "must not run"
    });

    expect((await handler(request)).status).toBe(status);
  });
});
