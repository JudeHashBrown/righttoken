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
import { BGroupWorkspace } from "@/components/b-group/b-group-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const data = {
  users: [
    {
      id: "user-1",
      registrationSequence: "10428",
      email: "liang@example.com",
      countryCode: "SG",
      checkoutStartedAt: new Date("2026-08-06T01:00:00Z")
    }
  ],
  selectedUser: {
    id: "user-1",
    registrationSequence: "10428",
    email: "liang@example.com",
    countryCode: "SG",
    checkoutStartedAt: new Date("2026-08-06T01:00:00Z"),
    episodeStartedAt: new Date("2026-08-06T01:00:00Z"),
    progress: {
      mailComplete: true,
      contactComplete: false,
      couponComplete: false,
      maintenanceComplete: true
    },
    mailStats: { sent: 2, received: 1, bounced: 0 },
    contact: null,
    coupon: null,
    maintenanceRecords: [
      {
        id: "record-1",
        body: "发送知识分享邮件",
        source: "MAIL" as const,
        occurredAt: new Date("2026-08-06T04:00:00Z"),
        effective: true
      }
    ]
  }
};

describe("BGroupWorkspace", () => {
  it("shows the compact queue and completion chain", () => {
    render(
      <BGroupWorkspace
        initialData={data}
        mailboxes={[]}
        templates={[]}
      />
    );
    expect(
      screen.getByRole("heading", {
        name: "已发起支付但未完成"
      })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("关键词或序号")).toBeInTheDocument();
    expect(screen.getAllByText("#10428")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /发邮件/ })).toHaveAttribute(
      "data-complete",
      "true"
    );
  });

  it("opens contact and maintenance inline", () => {
    render(
      <BGroupWorkspace
        initialData={data}
        mailboxes={[]}
        templates={[]}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /登记联系方式/ })
    );
    expect(screen.getByLabelText("微信号")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /日常维护/ })
    );
    expect(screen.getByLabelText("维护内容")).toBeInTheDocument();
    expect(screen.queryByLabelText("微信号")).not.toBeInTheDocument();
  });

  it("clears a manual maintenance entry after it is saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true })
    );
    render(
      <BGroupWorkspace
        initialData={data}
        mailboxes={[]}
        templates={[]}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /日常维护/ })
    );
    const body = screen.getByLabelText("维护内容");
    fireEvent.change(body, {
      target: { value: "电话确认用户仍在考虑" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));

    await waitFor(() => expect(body).toHaveValue(""));
  });
});
