import { describe, expect, it } from "vitest";
import { presentUserEvent } from "@/modules/presentation/events";

describe("presentUserEvent", () => {
  it("translates registration and payment events", () => {
    expect(
      presentUserEvent({
        eventType: "user.registered",
        applied: true,
        errorCode: null
      })
    ).toEqual({
      title: "完成注册",
      detail: "用户资料已更新"
    });
    expect(
      presentUserEvent({
        eventType: "payment.succeeded",
        applied: true,
        errorCode: null
      })
    ).toEqual({
      title: "支付成功",
      detail: "支付与余额信息已更新"
    });
  });

  it("uses a safe explanation when an event was not applied", () => {
    expect(
      presentUserEvent({
        eventType: "payment.succeeded",
        applied: false,
        errorCode: "INVALID_EVENT_PAYLOAD"
      })
    ).toEqual({
      title: "支付成功",
      detail: "这条动态未改变用户当前状态"
    });
  });

  it("never exposes an unknown event type or error code", () => {
    const result = presentUserEvent({
      eventType: "internal.schema_changed",
      applied: false,
      errorCode: "RAW_DATABASE_ERROR"
    });
    expect(result).toEqual({
      title: "用户信息发生变化",
      detail: "这条动态未改变用户当前状态"
    });
    expect(JSON.stringify(result)).not.toContain(
      "internal.schema_changed"
    );
    expect(JSON.stringify(result)).not.toContain("RAW_DATABASE_ERROR");
  });
});
