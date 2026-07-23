import { describe, expect, it } from "vitest";
import { GET as getLiveness } from "@/app/api/health/live/route";
import { createReadyHandler } from "@/app/api/health/ready/route";

describe("health routes", () => {
  it("returns a non-cacheable liveness response", async () => {
    const response = await getLiveness();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok"
    });
  });

  it("returns ready when the database probe succeeds", async () => {
    const response = await createReadyHandler(async () => undefined)();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "ready"
    });
  });

  it("returns 503 without leaking the database error", async () => {
    const response = await createReadyHandler(async () => {
      throw new Error("DATABASE_URL=postgresql://private");
    })();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('"status":"unavailable"');
    expect(body).not.toContain("DATABASE_URL");
    expect(body).not.toContain("postgresql");
  });
});
