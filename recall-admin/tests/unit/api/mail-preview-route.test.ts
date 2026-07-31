import { NextRequest } from "next/server";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    UnauthorizedError,
    ForbiddenError
  };
});

vi.mock("@/modules/auth/csrf", () => ({
  assertSameOrigin: mocks.assertSameOrigin
}));

vi.mock("@/modules/auth/guards", () => ({
  requireRequestPermission: mocks.requireRequestPermission,
  UnauthorizedError: mocks.UnauthorizedError,
  ForbiddenError: mocks.ForbiddenError
}));

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/mail/preview", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

describe("mail preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "operator-1", role: "OPERATOR" }
    });
  });

  it("returns the sanitized final preview and diagnostics", async () => {
    const { POST } = await import(
      "@/app/api/mail/preview/route"
    );

    const response = await POST(
      request({
        subject: "欢迎，[称呼]",
        bodyHtml:
          '<p>正文</p><img src="https://cdn.example.test/hero.png"><script>alert(1)</script>',
        assets: []
      })
    );

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      html: expect.not.stringContaining("<script"),
      text: "正文",
      diagnostics: {
        hasDangerousContent: true,
        externalImageCount: 1
      },
      unresolvedVariables: ["[称呼]"],
      canSend: false
    });
    expect(
      mocks.requireRequestPermission
    ).toHaveBeenCalledWith(
      expect.any(NextRequest),
      "mail:send-reviewed"
    );
  });

  it("rejects invalid input", async () => {
    const { POST } = await import(
      "@/app/api/mail/preview/route"
    );

    const response = await POST(
      request({ bodyHtml: "<p>正文</p>", extra: true })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_MAIL_PREVIEW_REQUEST"
    });
  });

  it("maps authorization failures", async () => {
    mocks.requireRequestPermission.mockRejectedValue(
      new mocks.ForbiddenError()
    );
    const { POST } = await import(
      "@/app/api/mail/preview/route"
    );

    const response = await POST(
      request({ subject: "", bodyHtml: "<p>正文</p>" })
    );

    expect(response.status).toBe(403);
  });
});
