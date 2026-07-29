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
import { WecomSettingsForm } from "@/components/settings/wecom-settings-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

describe("WecomSettingsForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("saves the webhook without retaining it in the form", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          credential: {
            id: "credential-1",
            displayName: "企微运营群",
            enabled: true
          }
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<WecomSettingsForm />);
    fireEvent.change(screen.getByLabelText("群机器人地址"), {
      target: {
        value:
          "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存企微连接" }));

    await waitFor(() => {
      expect(screen.getByText("企微连接已安全保存")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("群机器人地址")).toHaveValue("");
  });

  it("shows separate application and group robot configuration", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<WecomSettingsForm />);

    expect(
      screen.getByRole("heading", { name: "企业微信应用" })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("企业 ID（在企业微信后台查看）")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("应用 ID")).toBeInTheDocument();
    expect(screen.getByLabelText("应用密钥")).toHaveAttribute(
      "type",
      "password"
    );
    expect(
      screen.getByLabelText("测试接收人账号")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "运营群机器人" })
    ).toBeInTheDocument();
  });
});
