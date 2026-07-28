import { describe, expect, it } from "vitest";
import { rightTokenEventSchema } from "@/modules/users/event-schema";

const common = {
  event_id: "evt-test-1",
  occurred_at: "2026-07-23T12:00:00.000Z",
  user_id: "external-user-1"
};

describe("RightToken event contract", () => {
  it("parses a typed registration event", () => {
    const parsed = rightTokenEventSchema.parse({
      ...common,
      event_type: "user.registered",
      payload: {
        email: "new-user@example.test",
        display_name: "New User",
        country_code: "SG",
        source: "righttoken-web"
      }
    });

    expect(parsed.event_type).toBe("user.registered");
    expect(parsed.occurred_at).toBeInstanceOf(Date);
  });

  it("parses typed payment and balance events", () => {
    expect(
      rightTokenEventSchema.parse({
        ...common,
        event_type: "payment.succeeded",
        payload: {
          payment_id: "pay-1",
          amount_minor: 12_500
        }
      }).payload
    ).toMatchObject({ amount_minor: 12_500 });

    expect(
      rightTokenEventSchema.parse({
        ...common,
        event_id: "evt-test-2",
        event_type: "balance.changed",
        payload: { balance_minor: 8_000 }
      }).payload
    ).toEqual({ balance_minor: 8_000 });
  });

  it("rejects unknown top-level and payload properties", () => {
    expect(() =>
      rightTokenEventSchema.parse({
        ...common,
        event_type: "balance.changed",
        payload: {
          balance_minor: 8_000,
          unsafe_extra: "not allowed"
        }
      })
    ).toThrow();

    expect(() =>
      rightTokenEventSchema.parse({
        ...common,
        event_type: "service.recovered",
        payload: {},
        unsafe_extra: "not allowed"
      })
    ).toThrow();
  });
});
