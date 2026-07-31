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
    requireRequestPermission: vi.fn(),
    previewMailAudience: vi.fn(),
    UnauthorizedError,
    ForbiddenError
  };
});

vi.mock("@/modules/auth/guards", () => ({
  requireRequestPermission: mocks.requireRequestPermission,
  UnauthorizedError: mocks.UnauthorizedError,
  ForbiddenError: mocks.ForbiddenError
}));

vi.mock("@/modules/mail/mail-audience", () => ({
  previewMailAudience: mocks.previewMailAudience
}));

describe("mail audience preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRequestPermission.mockResolvedValue({
      member: { id: "operator-1", role: "OPERATOR" }
    });
  });

  it("returns only safe segment counts", async () => {
    mocks.previewMailAudience.mockResolvedValue({
      label: "F 组全员",
      total: 12,
      estimatedSkipped: 2
    });
    const { GET } = await import(
      "@/app/api/mail/audience-preview/route"
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/mail/audience-preview?mode=SEGMENT&segment=F"
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.previewMailAudience).toHaveBeenCalledWith(
      { id: "operator-1", role: "OPERATOR" },
      { mode: "SEGMENT", segment: "F" }
    );
    expect(body).toEqual({
      label: "F 组全员",
      total: 12,
      estimatedSkipped: 2
    });
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("rejects invalid audience combinations", async () => {
    const { GET } = await import(
      "@/app/api/mail/audience-preview/route"
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/mail/audience-preview?mode=ALL&segment=F"
      )
    );

    expect(response.status).toBe(400);
    expect(
      mocks.previewMailAudience
    ).not.toHaveBeenCalled();
  });

  it("returns unauthorized without exposing data", async () => {
    mocks.requireRequestPermission.mockRejectedValue(
      new mocks.UnauthorizedError()
    );
    const { GET } = await import(
      "@/app/api/mail/audience-preview/route"
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/mail/audience-preview?mode=ALL"
      )
    );

    expect(response.status).toBe(401);
    expect(
      mocks.previewMailAudience
    ).not.toHaveBeenCalled();
  });
});
