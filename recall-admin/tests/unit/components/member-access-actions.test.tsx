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

const successorOptions = [
  {
    id: "operator-2",
    displayName: "运营二",
    email: "operator2@example.test",
    role: "OPERATOR" as const
  },
  {
    id: "primary-1",
    displayName: "主管理员",
    email: "primary@example.test",
    role: "PRIMARY_ADMIN" as const
  }
];

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
        successorOptions={successorOptions}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "撤销权限" })
    );
    expect(
      screen.getByText(/客户和未完成任务会转给接管人/)
    ).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", {
      name: "确认撤销并交接"
    });
    expect(confirmButton).toBeDisabled();
    expect(
      screen.getByRole("option", {
        name: "运营二 · operator2@example.test · 运营人员"
      })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("工作接管人"), {
      target: { value: "operator-2" }
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "确认撤销并交接"
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/members/operator-1/access",
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            successorId: "operator-2"
          })
        }
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
        successorOptions={successorOptions}
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
        successorOptions={successorOptions}
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
        successorOptions={successorOptions}
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
        successorOptions={successorOptions}
      />
    );
    expect(
      screen.queryByRole("button", { name: "撤销权限" })
    ).not.toBeInTheDocument();
  });
});
