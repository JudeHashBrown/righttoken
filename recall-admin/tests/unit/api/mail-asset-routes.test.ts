import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  class MailAssetServiceError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    assertSameOrigin: vi.fn(),
    requireRequestPermission: vi.fn(),
    createMailAsset: vi.fn(),
    readMailAsset: vi.fn(),
    UnauthorizedError,
    ForbiddenError,
    MailAssetServiceError
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
vi.mock("@/modules/mail/assets/asset-service", () => ({
  createMailAsset: mocks.createMailAsset,
  readMailAsset: mocks.readMailAsset,
  MailAssetServiceError: mocks.MailAssetServiceError
}));

function uploadRequest(file: File): NextRequest {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest("http://localhost/api/mail/assets", {
    method: "POST",
    headers: { origin: "http://localhost" },
    body: form
  });
}

describe("mail asset routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: {
        id: "operator-1",
        role: "OPERATOR",
        active: true
      }
    });
  });

  it("uploads one private image for an operator", async () => {
    mocks.createMailAsset.mockResolvedValue({
      id: "asset-1",
      fileName: "guide.png",
      contentType: "image/png",
      byteSize: 200,
      width: 80,
      height: 60
    });
    const { POST } = await import("@/app/api/mail/assets/route");

    const response = await POST(
      uploadRequest(
        new File([Buffer.from("png")], "guide.png", {
          type: "image/png"
        })
      )
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      asset: {
        id: "asset-1",
        previewUrl: "/api/mail/assets/asset-1"
      }
    });
    expect(mocks.createMailAsset).toHaveBeenCalledWith({
      actorId: "operator-1",
      file: expect.any(File)
    });
  });

  it("returns a stable error for an unsupported image", async () => {
    mocks.createMailAsset.mockRejectedValue(
      new mocks.MailAssetServiceError("MAIL_IMAGE_UNSUPPORTED")
    );
    const { POST } = await import("@/app/api/mail/assets/route");

    const response = await POST(
      uploadRequest(
        new File([Buffer.from("<svg/>")], "unsafe.svg", {
          type: "image/svg+xml"
        })
      )
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      code: "MAIL_IMAGE_UNSUPPORTED"
    });
  });

  it("streams an authorized asset with safe headers", async () => {
    mocks.readMailAsset.mockResolvedValue({
      asset: {
        id: "asset-1",
        fileName: "说明图.png",
        contentType: "image/png",
        byteSize: 3
      },
      bytes: Buffer.from([1, 2, 3])
    });
    const { GET } = await import(
      "@/app/api/mail/assets/[id]/route"
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/mail/assets/asset-1?download=1"
      ),
      { params: Promise.resolve({ id: "asset-1" }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe(
      "nosniff"
    );
    expect(response.headers.get("content-disposition")).toContain(
      "attachment"
    );
  });

  it("returns forbidden before reading an asset", async () => {
    mocks.requireRequestPermission.mockRejectedValue(
      new mocks.ForbiddenError()
    );
    const { GET } = await import(
      "@/app/api/mail/assets/[id]/route"
    );

    const response = await GET(
      new NextRequest("http://localhost/api/mail/assets/asset-1"),
      { params: Promise.resolve({ id: "asset-1" }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.readMailAsset).not.toHaveBeenCalled();
  });
});
