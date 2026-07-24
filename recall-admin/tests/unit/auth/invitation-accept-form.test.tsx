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
import { InvitationAcceptForm } from "@/components/members/invitation-accept-form";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn() })
}));

describe("InvitationAcceptForm", () => {
  afterEach(() => {
    cleanup();
    replace.mockReset();
    vi.unstubAllGlobals();
  });

  it("accepts the invitation and returns the member to login", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          member: {
            id: "member-1",
            displayName: "新运营",
            role: "OPERATOR"
          }
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<InvitationAcceptForm token="opaque-invitation-token-123456" />);

    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "新运营" }
    });
    fireEvent.change(screen.getByLabelText("设置密码"), {
      target: { value: "NewOperatorPassword123!" }
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "NewOperatorPassword123!" }
    });
    fireEvent.click(screen.getByRole("button", { name: "完成账号开通" }));

    await waitFor(() => {
      expect(screen.getByText("账号已开通，正在前往登录页")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/members/invitations",
      expect.objectContaining({ method: "PUT" })
    );
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("does not submit when the passwords differ", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<InvitationAcceptForm token="opaque-invitation-token-123456" />);
    fireEvent.change(screen.getByLabelText("姓名"), {
      target: { value: "新运营" }
    });
    fireEvent.change(screen.getByLabelText("设置密码"), {
      target: { value: "NewOperatorPassword123!" }
    });
    fireEvent.change(screen.getByLabelText("确认密码"), {
      target: { value: "DifferentPassword123!" }
    });
    fireEvent.click(screen.getByRole("button", { name: "完成账号开通" }));

    expect(
      await screen.findByText("两次输入的密码不一致。")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
