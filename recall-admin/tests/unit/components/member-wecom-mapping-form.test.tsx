// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemberWecomMappingForm } from "@/components/members/member-wecom-mapping-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("MemberWecomMappingForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a non-technical mapping state and saves a UserID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          member: {
            id: "member-1",
            wecomUserId: "zhangsan"
          }
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MemberWecomMappingForm
        memberId="member-1"
        initialWecomUserId={null}
        active
      />
    );

    expect(screen.getByText("未映射")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("企微 UserID"), {
      target: { value: "zhangsan" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/members/member-1/wecom",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ wecomUserId: "zhangsan" })
        })
      );
    });
  });

  it("labels inactive members without exposing internal enums", () => {
    render(
      <MemberWecomMappingForm
        memberId="member-2"
        initialWecomUserId="lisi"
        active={false}
      />
    );
    expect(screen.getByText("成员已停用")).toBeInTheDocument();
  });
});
