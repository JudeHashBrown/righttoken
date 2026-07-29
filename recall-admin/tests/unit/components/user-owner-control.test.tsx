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
import { UserOwnerControl } from "@/components/users/user-owner-control";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

describe("UserOwnerControl", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows manual state and restores automatic assignment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          result: {
            ownerId: "operator-1",
            mode: "AUTO"
          }
        })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserOwnerControl
        userId="user-1"
        currentOwnerId="operator-2"
        currentOwnerName="运营乙"
        assignmentMode="MANUAL"
        members={[
          { id: "operator-1", displayName: "运营甲" },
          { id: "operator-2", displayName: "运营乙" }
        ]}
      />
    );

    expect(screen.getByText("人工分配")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "恢复自动分配" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "确认恢复" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users/user-1/owner",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("requires a reason when an administrator changes the owner", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserOwnerControl
        userId="user-1"
        currentOwnerId="operator-1"
        currentOwnerName="运营甲"
        assignmentMode="AUTO"
        members={[
          { id: "operator-1", displayName: "运营甲" },
          { id: "operator-2", displayName: "运营乙" }
        ]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "调整负责人" })
    );
    fireEvent.change(screen.getByLabelText("新负责人"), {
      target: { value: "operator-2" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认调整" })
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("调整原因"), {
      target: { value: "交给当地运营继续跟进" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认调整" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users/user-1/owner",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            ownerId: "operator-2",
            reason: "交给当地运营继续跟进"
          })
        })
      );
    });
  });
});
