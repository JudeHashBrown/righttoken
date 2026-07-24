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
import { RightTokenSettingsForm } from "@/components/settings/righttoken-settings-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("RightTokenSettingsForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("can enable the local simulator without production credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<RightTokenSettingsForm />);

    fireEvent.click(
      screen.getByRole("button", { name: "保存数据源" })
    );

    await waitFor(() => {
      expect(screen.getByText("RightToken 数据源已安全保存")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/integrations/righttoken",
      expect.objectContaining({
        body: expect.stringContaining('"mode":"simulator"')
      })
    );
  });
});
