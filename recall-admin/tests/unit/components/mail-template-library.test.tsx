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
import {
  MailTemplateLibrary
} from "@/components/mail/mail-template-library";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

const inactiveTemplate = {
  id: "template-1",
  key: "payment",
  version: 3,
  name: "支付协助",
  locale: "zh-CN",
  subject: "完成首次支付",
  bodyText: "你好，我们可以协助你完成首次支付。",
  active: false
};

describe("MailTemplateLibrary", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("manages an inactive public template without a mail thread", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<MailTemplateLibrary templates={[inactiveTemplate]} />);

    expect(
      screen.getByRole("heading", { name: "公共邮件模板" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("模板名称")).toHaveValue("支付协助");
    expect(screen.getByLabelText("邮件主题")).toHaveValue(
      "完成首次支付"
    );
    expect(screen.getByLabelText("邮件正文")).toHaveValue(
      "你好，我们可以协助你完成首次支付。"
    );
    expect(
      screen.getByRole("button", { name: "启用模板" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("模板名称"), {
      target: { value: "支付问题协助" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "发布新版本" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/mail/templates/payment/versions",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining(
            '"name":"支付问题协助"'
          )
        })
      );
    });
  });

  it("lets operators create a template when the library is empty", () => {
    render(<MailTemplateLibrary templates={[]} />);

    expect(
      screen.getByText("还没有公共邮件模板")
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "新建第一个模板" })
    );
    expect(
      screen.getByText("新建公共模板")
    ).toBeInTheDocument();
  });
});
