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
import { UserLocationControl } from "@/components/users/user-location-control";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

describe("UserLocationControl", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps location and owner actions separate", () => {
    render(
      <UserLocationControl
        assignmentMode="AUTO"
        currentCountryCode={null}
        currentRegion={null}
        userId="user-1"
      />
    );

    expect(
      screen.getByRole("button", { name: "确认所属地区" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "调整负责人" })
    ).not.toBeInTheDocument();
  });

  it("requires country and reason before confirming", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UserLocationControl
        assignmentMode="AUTO"
        currentCountryCode={null}
        currentRegion={null}
        userId="user-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "确认所属地区" })
    );
    fireEvent.change(screen.getByLabelText("国家或地区"), {
      target: { value: "CN" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认地区" })
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("确认原因"), {
      target: { value: "客户在沟通中确认" }
    });
    fireEvent.change(screen.getByLabelText("省 / 州 / 地区"), {
      target: { value: "广东" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "确认地区" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users/user-1/location",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            countryCode: "CN",
            region: "广东",
            reason: "客户在沟通中确认"
          })
        })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("restores automatic location determination", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <UserLocationControl
        assignmentMode="MANUAL"
        currentCountryCode="CN"
        currentRegion="广东"
        userId="user-1"
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "恢复自动判定" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "确认恢复" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users/user-1/location",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });
});
