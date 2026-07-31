// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VisitsPage from "@/app/(dashboard)/visits/page";
import { getVisitDashboard } from "@/modules/visits/queries";

vi.mock("@/modules/admin/page-access", () => ({
  requireAdministrator: vi.fn().mockResolvedValue({
    id: "admin-1",
    role: "ADMIN"
  })
}));

vi.mock("@/modules/visits/queries", () => ({
  getVisitDashboard: vi.fn()
}));

describe("VisitsPage", () => {
  beforeEach(() => {
    vi.mocked(getVisitDashboard).mockResolvedValue({
      rangeDays: 7,
      today: { uv: 18, pv: 42 },
      period: { uv: 96, pv: 210 },
      daily: [
        { date: "2026-07-30", uv: 12, pv: 31 },
        { date: "2026-07-31", uv: 18, pv: 42 }
      ],
      countries: [
        {
          countryCode: "CN",
          name: "中国大陆",
          uv: 50,
          pv: 120
        },
        {
          countryCode: "US",
          name: "美国",
          uv: 24,
          pv: 48
        }
      ],
      chinaRegions: [
        { region: "广东", uv: 20, pv: 52 },
        { region: "北京", uv: 14, pv: 31 }
      ]
    });
  });

  it("renders the visit overview, trend and geography rankings", async () => {
    render(
      await VisitsPage({
        searchParams: Promise.resolve({ days: "7" })
      })
    );

    expect(
      screen.getByRole("heading", { name: "访问看板" })
    ).toBeInTheDocument();
    expect(screen.getByText("今日访客")).toBeInTheDocument();
    expect(screen.getByText("今日访问")).toBeInTheDocument();
    expect(screen.getByText("每日访问趋势")).toBeInTheDocument();
    expect(screen.getByText("全球国家或地区")).toBeInTheDocument();
    expect(screen.getByText("中国大陆省份")).toBeInTheDocument();
    expect(screen.getByText("广东")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "7 天" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(getVisitDashboard).toHaveBeenCalledWith(7);
  });

  it("falls back to 30 days for unsupported ranges", async () => {
    render(
      await VisitsPage({
        searchParams: Promise.resolve({ days: "365" })
      })
    );

    expect(getVisitDashboard).toHaveBeenCalledWith(30);
  });
});
