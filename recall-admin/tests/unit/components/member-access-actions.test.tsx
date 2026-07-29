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
import { MemberAccessActions } from "@/components/members/member-access-actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("MemberAccessActions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("revokes an operator after explicit confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          reassignedUsers: 2,
          transferredTasks: 3,
          failedUsers: 0
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberAccessActions
        memberId="operator-1"
        memberRole="OPERATOR"
        memberName="运营一"
        active
        viewerId="primary-1"
        viewerRole="PRIMARY_ADMIN"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "撤销权限" })
    );
    expect(
      screen.getByText(/撤销后，该成员将立即退出/)
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "确认撤销" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/members/operator-1/access",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("does not offer revocation for the primary administrator or viewer", () => {
    const { rerender } = render(
      <MemberAccessActions
        memberId="primary-1"
        memberRole="PRIMARY_ADMIN"
        memberName="主管理员"
        active
        viewerId="primary-1"
        viewerRole="PRIMARY_ADMIN"
      />
    );
    expect(
      screen.queryByRole("button", { name: "撤销权限" })
    ).not.toBeInTheDocument();

    rerender(
      <MemberAccessActions
        memberId="admin-1"
        memberRole="ADMIN"
        memberName="管理员"
        active
        viewerId="admin-1"
        viewerRole="ADMIN"
      />
    );
    expect(
      screen.queryByRole("button", { name: "撤销权限" })
    ).not.toBeInTheDocument();
  });

  it("allows administrators to revoke operators but not administrators", () => {
    const { rerender } = render(
      <MemberAccessActions
        memberId="operator-1"
        memberRole="OPERATOR"
        memberName="运营"
        active
        viewerId="admin-1"
        viewerRole="ADMIN"
      />
    );
    expect(
      screen.getByRole("button", { name: "撤销权限" })
    ).toBeInTheDocument();

    rerender(
      <MemberAccessActions
        memberId="admin-2"
        memberRole="ADMIN"
        memberName="管理员二"
        active
        viewerId="admin-1"
        viewerRole="ADMIN"
      />
    );
    expect(
      screen.queryByRole("button", { name: "撤销权限" })
    ).not.toBeInTheDocument();
  });
});
