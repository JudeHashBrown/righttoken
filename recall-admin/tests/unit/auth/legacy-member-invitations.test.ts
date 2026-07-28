import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  POST,
  PUT
} from "@/app/api/members/invitations/route";

describe("legacy member invitation routes", () => {
  it("refuses standalone recall-admin invitations", async () => {
    const request = new NextRequest(
      "http://127.0.0.1:3101/api/members/invitations",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3101"
        },
        body: JSON.stringify({
          email: "user@example.test",
          role: "OPERATOR"
        })
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({
      code: "RIGHTTOKEN_MEMBER_ACCESS_REQUIRED"
    });
  });

  it("refuses acceptance of old invitation links", async () => {
    const request = new NextRequest(
      "http://127.0.0.1:3101/api/members/invitations",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3101"
        },
        body: JSON.stringify({
          token: "old-invitation-token-that-is-long-enough",
          displayName: "Old User"
        })
      }
    );

    expect((await PUT(request)).status).toBe(410);
  });
});
