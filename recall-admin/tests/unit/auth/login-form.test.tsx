// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/app/(auth)/login/login-form";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh })
}));

describe("login form", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    replace.mockReset();
    refresh.mockReset();
  });

  it("submits credentials and shows the safe API error", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ code: "INVALID_CREDENTIALS" }),
        {
          status: 401,
          headers: { "content-type": "application/json" }
        }
      )
    );

    render(<LoginForm redirectTo="/dashboard" />);
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "operator@example.test" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "incorrect-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "邮箱或密码不正确"
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("continues an administrator into required 2FA enrollment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ nextStep: "ENROLL_2FA" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    render(<LoginForm redirectTo="/dashboard" />);
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "admin@example.test" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "a-secure-admin-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(
        "/2fa/setup?mode=enroll"
      );
    });
  });
});
