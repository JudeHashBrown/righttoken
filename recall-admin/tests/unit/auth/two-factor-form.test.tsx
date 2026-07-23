// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TwoFactorForm } from "@/app/2fa/setup/two-factor-form";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh })
}));

describe("two-factor form", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    replace.mockReset();
    refresh.mockReset();
  });

  it("verifies an existing TOTP and enters the dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ verified: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    render(<TwoFactorForm mode="verify" />);
    fireEvent.change(screen.getByLabelText("6 位验证码"), {
      target: { value: "123456" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "完成验证" })
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("loads enrollment material and shows recovery codes once", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            otpauthUrl:
              "otpauth://totp/RightToken:test?secret=TESTSECRET",
            qrDataUrl: "data:image/png;base64,dGVzdA==",
            pendingSecretToken: "encrypted-pending-token"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            verified: true,
            recoveryCodes: ["AAAA-BBBB-CCCC-DDDD"]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );

    render(<TwoFactorForm mode="enroll" />);
    expect(
      await screen.findByAltText("RightToken 二次验证二维码")
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("6 位验证码"), {
      target: { value: "123456" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "绑定并验证" })
    );

    expect(
      await screen.findByText("AAAA-BBBB-CCCC-DDDD")
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("recovers a stale verification session by opening enrollment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ code: "TWO_FACTOR_SETUP_REQUIRED" }),
        {
          status: 409,
          headers: { "content-type": "application/json" }
        }
      )
    );

    render(<TwoFactorForm mode="verify" />);
    fireEvent.change(screen.getByLabelText("6 位验证码"), {
      target: { value: "123456" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "完成验证" })
    );

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/2fa/setup?mode=enroll"
      );
      expect(refresh).toHaveBeenCalled();
    });
  });
});
