// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VisitsPage from "@/app/(dashboard)/visits/page";
import { getGeoIpRuntimeStatus } from "@/modules/geoip/runtime-status";
import { getUserCountrySummary } from "@/modules/users/country-summary";
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

vi.mock("@/modules/users/country-summary", () => ({
  getUserCountrySummary: vi.fn()
}));

vi.mock("@/modules/geoip/runtime-status", () => ({
  getGeoIpRuntimeStatus: vi.fn()
}));

describe("VisitsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        },
        {
          countryCode: "ZZ",
          name: "未知",
          uv: 2,
          pv: 4
        }
      ],
      chinaRegions: [
        { region: "广东", uv: 20, pv: 52 },
        { region: "北京", uv: 14, pv: 31 }
      ]
    });
    vi.mocked(getUserCountrySummary).mockResolvedValue({
      total: 20,
      countries: [
        { countryCode: "SG", name: "新加坡", users: 12 },
        { countryCode: "GB", name: "英国", users: 8 }
      ]
    });
    vi.mocked(getGeoIpRuntimeStatus).mockResolvedValue({
      kind: "unavailable",
      provinceCapable: false
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
    expect(
      screen.getByRole("heading", { name: "访问 IP 国家或地区" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("该表按页面访问时的 IP 统计，不读取用户档案地区。")
    ).toBeInTheDocument();
    expect(screen.getByText("中国大陆省份")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "注册用户运营归因国家" })
    ).toBeInTheDocument();
    expect(screen.getByText("新加坡")).toBeInTheDocument();
    expect(screen.getByText("英国")).toBeInTheDocument();
    expect(screen.getByText(/GeoIP 数据源不可用/)).toBeInTheDocument();
    expect(screen.getByText("广东")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "7 天" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(getVisitDashboard).toHaveBeenCalledWith(7);
    expect(getUserCountrySummary).toHaveBeenCalledTimes(1);
    expect(getGeoIpRuntimeStatus).toHaveBeenCalledTimes(1);
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
