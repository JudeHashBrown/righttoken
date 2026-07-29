import { describe, expect, it } from "vitest";
import {
  locationSourceLabel,
  operationalLocationDisplay,
  paymentStatusLabel,
  userSourceLabel
} from "@/modules/users/presentation";

describe("operationalLocationDisplay", () => {
  it("treats a resolved country without province as confirmed", () => {
    expect(
      operationalLocationDisplay({
        countryCode: "CN",
        region: null
      })
    ).toEqual({
      primary: "中国",
      secondary: "国家已确认"
    });
  });

  it("shows both country and province when available", () => {
    expect(
      operationalLocationDisplay({
        countryCode: "CN",
        region: "广东"
      })
    ).toEqual({
      primary: "中国",
      secondary: "广东"
    });
  });

  it("does not claim confirmation when no location was resolved", () => {
    expect(
      operationalLocationDisplay({
        countryCode: null,
        region: null
      })
    ).toEqual({
      primary: "未识别",
      secondary: "注册来源信息不足"
    });
  });
});

describe("paymentStatusLabel", () => {
  it("translates the internal NONE status into business language", () => {
    expect(paymentStatusLabel("NONE", 0)).toBe("未产生付费记录");
  });

  it("shows paid when payment facts contain a paid amount", () => {
    expect(paymentStatusLabel("NONE", 100)).toBe("已支付");
    expect(paymentStatusLabel("PAID", 0)).toBe("已支付");
  });

  it("does not expose unknown internal status codes", () => {
    expect(paymentStatusLabel("SYNC_PENDING", 0)).toBe(
      "支付状态待同步"
    );
  });
});

describe("source labels", () => {
  it("uses user language and never exposes unknown source codes", () => {
    expect(locationSourceLabel("EMAIL_EXACT_DOMAIN")).toBe(
      "邮箱服务商"
    );
    expect(locationSourceLabel("IP_GEOIP")).toBe("注册 IP 所在地");
    expect(locationSourceLabel("NEW_INTERNAL_SOURCE")).toBe(
      "注册来源信息"
    );
    expect(userSourceLabel("righttoken")).toBe("RightToken 主站");
    expect(userSourceLabel("INTERNAL_IMPORT_V2")).toBe(
      "RightToken 主站"
    );
  });
});
