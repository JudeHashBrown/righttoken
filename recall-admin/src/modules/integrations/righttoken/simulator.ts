import type {
  RightTokenAdapter,
  RightTokenUserSnapshot
} from "@/modules/integrations/righttoken/adapter";

const baseNow = new Date("2026-07-24T02:00:00.000Z");
const hour = 60 * 60 * 1000;
const day = 24 * hour;

type Scenario = "A" | "B" | "C" | "D" | "E" | "F" | "G";

function scenarios(): Scenario[] {
  return [
    ...Array<Scenario>(25).fill("A"),
    ...Array<Scenario>(15).fill("B"),
    ...Array<Scenario>(10).fill("C"),
    ...Array<Scenario>(8).fill("D"),
    ...Array<Scenario>(8).fill("E"),
    ...Array<Scenario>(2).fill("F"),
    ...Array<Scenario>(32).fill("G")
  ];
}

function snapshot(
  scenario: Scenario,
  index: number
): RightTokenUserSnapshot {
  const registeredAt = new Date(
    baseNow.getTime() - (index + 2) * hour
  );
  const paid = ["C", "D", "E", "F", "G"].includes(scenario);
  const called = ["D", "E", "F", "G"].includes(scenario);
  const firstPaidAt = paid
    ? new Date(registeredAt.getTime() + hour)
    : null;
  const lastCallAt = called
    ? new Date(
        baseNow.getTime() -
          (scenario === "D" ? 10 * day : Math.max(1, index % 24) * hour)
      )
    : null;
  return {
    externalUserId: `SIM-${String(index + 1).padStart(4, "0")}`,
    email: `sim-${String(index + 1).padStart(4, "0")}@example.test`,
    displayName: `模拟用户 ${index + 1}`,
    registeredAt,
    updatedAt: new Date(baseNow.getTime() + index * 1000),
    registrationIp: `203.0.113.${(index % 250) + 1}`,
    countryCode: index % 3 === 0 ? "SG" : index % 3 === 1 ? "US" : "CN",
    region: index % 3 === 0 ? "新加坡" : index % 3 === 1 ? "加利福尼亚" : "上海",
    language: index % 3 === 1 ? "en-US" : "zh-CN",
    timezone:
      index % 3 === 0
        ? "Asia/Singapore"
        : index % 3 === 1
          ? "America/Los_Angeles"
          : "Asia/Shanghai",
    source: index % 2 === 0 ? "organic" : "campaign",
    checkoutStartedAt:
      scenario === "B"
        ? new Date(registeredAt.getTime() + 30 * 60 * 1000)
        : null,
    firstPaidAt,
    totalPaidMinor: paid ? 10_000 + index * 100 : 0,
    successfulCallCount: called ? 1 + (index % 20) : 0,
    lastCallAt,
    balanceMinor: scenario === "E" ? 0 : paid ? 5_000 : 0,
    balanceCurrency: "USD",
    balanceUsdMinor:
      scenario === "E" ? 0 : paid ? 5_000 : 0,
    anomalyActive: scenario === "F"
  };
}

export function createRightTokenSimulator(): RightTokenAdapter {
  const users = scenarios().map(snapshot);
  return {
    async verifyConnection() {
      return { ok: true, source: "righttoken-simulator" };
    },
    async listUsers(input) {
      const limit = Math.min(500, Math.max(1, input.limit));
      const filtered = input.updatedAfter
        ? users.filter((user) => user.updatedAt > input.updatedAfter!)
        : users;
      const offset = Math.max(
        0,
        Number.parseInt(input.cursor ?? "0", 10) || 0
      );
      const page = filtered.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      return {
        users: page.map((user) => ({ ...user })),
        nextCursor:
          nextOffset < filtered.length ? String(nextOffset) : null
      };
    }
  };
}
