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

  it("reauthenticates and creates an operator invitation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ reauthenticated: true })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            invitationId: "invite-1",
            token: "a-very-long-development-invitation-token",
            role: "OPERATOR",
            expiresAt: "2026-07-26T10:00:00.000Z"
          })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberInviteForm viewerRole="PRIMARY_ADMIN" twoFactorOn={false} />
    );

    fireEvent.change(screen.getByLabelText("成员邮箱"), {
      target: { value: "operator@example.test" }
    });
    fireEvent.change(screen.getByLabelText("成员角色"), {
      target: { value: "OPERATOR" }
    });
    fireEvent.change(screen.getByLabelText("当前账号密码"), {
      target: { value: "DevelopmentOnlyPassword123!" }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建邀请" }));

    await waitFor(() => {
      expect(
        screen.getByText("邀请已创建，有效期 48 小时")
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/reauthenticate",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/members/invitations",
      expect.objectContaining({ method: "POST" })
    );
    expect(
      screen.getByDisplayValue(
        /\/members\/invitations\/accept\?token=a-very-long-development-invitation-token/
      )
    ).toBeInTheDocument();
  });

  it("only allows administrators to invite operators", () => {
    render(<MemberInviteForm viewerRole="ADMIN" twoFactorOn={true} />);

    const roleSelect = screen.getByLabelText("成员角色");
    expect(roleSelect).toHaveValue("OPERATOR");
    expect(
      screen.queryByRole("option", { name: "管理员" })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("二次验证码")).toBeInTheDocument();
  });
});
