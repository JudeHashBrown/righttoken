// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MailTemplateTabs
} from "@/components/mail/mail-template-tabs";

const templates = [
  {
    id: "template-1",
    key: "registration",
    version: 1,
    name: "注册未支付",
    locale: "zh-CN",
    subject: "完成首次支付",
    bodyText: "我们可以协助你完成首次支付。",
    active: true
  },
  {
    id: "template-2",
    key: "balance",
    version: 2,
    name: "余额不足",
    locale: "zh-CN",
    subject: "余额提醒",
    bodyText: "你的余额可能不足。",
    active: true
  }
];

describe("MailTemplateTabs", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("selects a public template tab", () => {
    const onSelect = vi.fn();
    render(
      <MailTemplateTabs
        templates={templates}
        selectedTemplateId="template-1"
        dirty={false}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "余额不足" }));

    expect(onSelect).toHaveBeenCalledWith(templates[1]);
  });

  it("keeps edited content when template switching is cancelled", () => {
    const onSelect = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <MailTemplateTabs
        templates={templates}
        selectedTemplateId="template-1"
        dirty
        onSelect={onSelect}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onToggle={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "余额不足" }));

    expect(window.confirm).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows template management actions to operators", () => {
    render(
      <MailTemplateTabs
        templates={templates}
        selectedTemplateId="template-1"
        dirty={false}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onToggle={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: "新建模板" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "更新当前模板" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "停用当前模板" })
    ).toBeInTheDocument();
  });
});
