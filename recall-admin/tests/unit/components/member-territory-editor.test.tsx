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
import { MemberTerritoryEditor } from "@/components/members/member-territory-editor";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

describe("MemberTerritoryEditor", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("previews and saves an operator's responsible regions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sampledUsers: 87,
            publicPool: 0,
            unmatchedConditions: 3
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            published: 2,
            runId: "run-1"
          })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemberTerritoryEditor
        member={{ id: "operator-1", displayName: "运营甲" }}
        initialTerritories={[
          { countryCode: "CN", regions: ["广东"] }
        ]}
        allRules={[]}
      />
    );

    expect(screen.getByText("CN · 广东")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "设置负责地区" })
    );
    expect(screen.getByDisplayValue("CN")).toBeInTheDocument();
    expect(screen.getByDisplayValue("广东")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "预览影响" })
    );
    await waitFor(() => {
      expect(screen.getByText("预计查看 87 位用户")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "保存负责地区" })
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/automation/assignment-rules",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(refresh).toHaveBeenCalled();
  });
});
