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
import { MemberInviteForm } from "@/components/members/member-invite-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("MemberInviteForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("grants access to a synchronized RightToken user", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          member: {
            id: "member-1",
            email: "operator@example.test",
            role: "OPERATOR",
            active: true
          }
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<MemberInviteForm viewerRole="PRIMARY_ADMIN" />);

    fireEvent.change(screen.getByLabelText("成员邮箱"), {
      target: { value: "operator@example.test" }
    });
    fireEvent.change(screen.getByLabelText("成员角色"), {
      target: { value: "OPERATOR" }
    });
    fireEvent.click(screen.getByRole("button", { name: "添加成员" }));

    await waitFor(() => {
      expect(
        screen.getByText("成员权限已添加")
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/members/access",
      expect.objectContaining({ method: "POST" })
    );
    expect(
      screen.queryByLabelText("邀请链接")
    ).not.toBeInTheDocument();
  });

  it("only allows administrators to add operators", () => {
    render(<MemberInviteForm viewerRole="ADMIN" />);

    const roleSelect = screen.getByLabelText("成员角色");
    expect(roleSelect).toHaveValue("OPERATOR");
    expect(
      screen.queryByRole("option", { name: "管理员" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("只能添加已经注册 RightToken 的用户")
    ).toBeInTheDocument();
  });
});
