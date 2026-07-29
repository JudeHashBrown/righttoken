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
import { LocationRuleEditor } from "@/components/automation/location-rule-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("LocationRuleEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("edits and previews compact email attribution rules", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        totalUsers: 182,
        changedUsers: 12,
        countsByCountry: { CN: 80, RU: 15 }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LocationRuleEditor
        editable
        initialRules={[
          {
            id: "qq",
            name: "QQ 邮箱",
            enabled: true,
            priority: 1,
            matchType: "EXACT_DOMAIN",
            pattern: "qq.com",
            countryCode: "CN"
          }
        ]}
      />
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByDisplayValue("qq.com")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "新增邮箱判断条件" })
    );
    expect(screen.getAllByRole("row")).toHaveLength(3);
    fireEvent.change(screen.getAllByLabelText("邮箱域名或后缀")[1]!, {
      target: { value: ".ru" }
    });
    fireEvent.change(
      screen.getAllByLabelText("判断为哪个国家或地区")[1]!,
      {
      target: { value: "RU" }
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "预览影响" }));

    await waitFor(() => {
      expect(screen.getByText("预计调整 12 位用户")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/automation/location-rules/preview",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"pattern":".ru"')
      })
    );
  });

  it("renders read-only rules for non-primary administrators", () => {
    render(
      <LocationRuleEditor
        editable={false}
        initialRules={[
          {
            id: "qq",
            name: "QQ 邮箱",
            enabled: true,
            priority: 1,
            matchType: "EXACT_DOMAIN",
            pattern: "qq.com",
            countryCode: "CN"
          }
        ]}
      />
    );

    expect(screen.getByDisplayValue("qq.com")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "保存邮箱判断" })
    ).not.toBeInTheDocument();
  });
});
