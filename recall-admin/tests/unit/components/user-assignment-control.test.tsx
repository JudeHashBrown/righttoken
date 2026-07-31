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
import { UserAssignmentControl } from "@/components/users/user-assignment-control";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

describe("UserAssignmentControl", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("submits a confirmed location for automatic matching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UserAssignmentControl
        currentCountryCode={null}
        currentRegion={null}
        members={[{ id: "operator-1", displayName: "华南运营" }]}
        userId="user-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "立即分配" })
    );
    fireEvent.change(screen.getByLabelText("国家代码"), {
      target: { value: "cn" }
    });
    fireEvent.change(screen.getByLabelText("省份或地区"), {
      target: { value: "广东" }
    });
    fireEvent.change(screen.getByLabelText("分配原因"), {
      target: { value: "确认地区" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认分配" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users/user-1/assignment",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            countryCode: "CN",
            region: "广东",
            reason: "确认地区"
          })
        })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("can directly assign an operator without changing location", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UserAssignmentControl
        currentCountryCode="DE"
        currentRegion={null}
        members={[{ id: "operator-1", displayName: "欧洲运营" }]}
        userId="user-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "立即分配" })
    );
    fireEvent.change(screen.getByLabelText("指定运营人员"), {
      target: { value: "operator-1" }
    });
    fireEvent.change(screen.getByLabelText("分配原因"), {
      target: { value: "暂由欧洲运营负责" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认分配" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users/user-1/assignment",
        expect.objectContaining({
          body: JSON.stringify({
            ownerId: "operator-1",
            reason: "暂由欧洲运营负责"
          })
        })
      );
    });
  });

  it("requires a location or owner and a reason", () => {
    render(
      <UserAssignmentControl
        currentCountryCode={null}
        currentRegion={null}
        members={[]}
        userId="user-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "立即分配" })
    );

    expect(
      screen.getByRole("button", { name: "确认分配" })
    ).toBeDisabled();
  });
});
