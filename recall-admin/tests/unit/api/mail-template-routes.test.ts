import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    listActiveMailTemplates: vi.fn(),
    createMailTemplate: vi.fn(),
    publishMailTemplateVersion: vi.fn(),
    setMailTemplateEnabled: vi.fn(),
    archiveMailTemplateVersion: vi.fn(),
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

vi.mock("@/modules/mail/template-service", () => ({
  listActiveMailTemplates: mocks.listActiveMailTemplates,
  createMailTemplate: mocks.createMailTemplate,
  publishMailTemplateVersion: mocks.publishMailTemplateVersion,
  setMailTemplateEnabled: mocks.setMailTemplateEnabled,
  archiveMailTemplateVersion: mocks.archiveMailTemplateVersion,
  MailTemplateConflictError: class extends Error {},
  MailTemplateNotFoundError: class extends Error {}
}));

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

describe("mail template routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "operator-1", role: "OPERATOR" }
    });
  });

  it("lists active public templates", async () => {
    mocks.listActiveMailTemplates.mockResolvedValue([
      {
        id: "template-1",
        key: "welcome",
        version: 1,
        name: "欢迎",
        subject: "欢迎使用",
        bodyText: "你好",
        active: true
      }
    ]);
    const { GET } = await import(
      "@/app/api/mail/templates/route"
    );

    const response = await GET(
      new NextRequest("http://localhost/api/mail/templates")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      templates: [{ id: "template-1", key: "welcome" }]
    });
  });

  it("lets an operator create a public template", async () => {
    mocks.createMailTemplate.mockResolvedValue({
      id: "template-1",
      key: "welcome",
      version: 1
    });
    const { POST } = await import(
      "@/app/api/mail/templates/route"
    );

    const response = await POST(
      jsonRequest("http://localhost/api/mail/templates", {
        name: "欢迎",
        subject: "欢迎使用",
        bodyText: "你好"
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.createMailTemplate).toHaveBeenCalledWith({
      actorId: "operator-1",
      name: "欢迎",
      subject: "欢迎使用",
      bodyText: "你好",
      locale: "zh-CN"
    });
  });

  it("rejects an invalid template body", async () => {
    const { POST } = await import(
      "@/app/api/mail/templates/route"
    );

    const response = await POST(
      jsonRequest("http://localhost/api/mail/templates", {
        name: "",
        subject: "",
        bodyText: ""
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_MAIL_TEMPLATE_REQUEST"
    });
    expect(mocks.createMailTemplate).not.toHaveBeenCalled();
  });

  it("returns forbidden when an operator tries to archive a version", async () => {
    mocks.requireRequestPermission.mockRejectedValue(
      new mocks.ForbiddenError()
    );
    const { POST } = await import(
      "@/app/api/mail/templates/[id]/archive/route"
    );

    const response = await POST(
      jsonRequest(
        "http://localhost/api/mail/templates/template-1/archive",
        {}
      ),
      { params: Promise.resolve({ id: "template-1" }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.archiveMailTemplateVersion).not.toHaveBeenCalled();
  });
});
