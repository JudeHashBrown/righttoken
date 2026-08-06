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
import { AGroupWorkspace } from "@/components/a-group/a-group-workspace";

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
      id: "user-a-1",
      registrationSequence: "20428",
      email: "new-user@example.com",
      countryCode: "SG",
      registeredAt: new Date("2026-08-06T01:00:00Z")
    }
  ],
  selectedUser: {
    id: "user-a-1",
    registrationSequence: "20428",
    email: "new-user@example.com",
    countryCode: "SG",
    registeredAt: new Date("2026-08-06T01:00:00Z"),
    episodeStartedAt: new Date("2026-08-06T01:00:00Z"),
    progress: {
      mailComplete: false,
      contactComplete: false,
      couponComplete: false,
      maintenanceComplete: false
    },
    mailStats: { sent: 0, received: 0, bounced: 0 },
    contact: null,
    coupon: null,
    maintenanceRecords: []
  }
};

describe("AGroupWorkspace", () => {
  it("shows A-group reasons and compact action chain", () => {
    render(
      <AGroupWorkspace
        initialData={data}
        mailboxes={[]}
        templates={[]}
      />
    );

    expect(
      screen.getByRole("heading", {
        name: "新注册但未发起支付"
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("偶然在社交媒体看到，出于好奇注册")
    ).toBeInTheDocument();
    expect(screen.getByText("浏览价格后认为价格偏高"))
      .toBeInTheDocument();
    expect(screen.getByText("A组用户")).toBeInTheDocument();
    expect(screen.getAllByText("#20428")).toHaveLength(2);
  });

  it("defaults inline mail to knowledge sharing", () => {
    render(
      <AGroupWorkspace
        initialData={data}
        mailboxes={[
          {
            id: "mailbox-1",
            name: "企业微信邮箱",
            emailAddress: "support@example.com"
          }
        ]}
        templates={[]}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: /发邮件/ })
    );
    expect(screen.getByLabelText("邮件类型")).toHaveValue(
      "KNOWLEDGE_SHARE"
    );
  });

  it("opens contact and maintenance inline", () => {
    render(
      <AGroupWorkspace
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
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal(
      "fetch",
      fetchMock
    );
    render(
      <AGroupWorkspace
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
      target: { value: "发送首次知识分享" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/a-group/users/user-a-1/maintenance",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() => expect(body).toHaveValue(""));
  });
});
