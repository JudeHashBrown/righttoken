import { describe, expect, it, vi } from "vitest";
import {
  HttpGeoIpResolver,
  createGeoIpResolver
} from "@/modules/geoip/http-resolver";
import { isPublicIp } from "@/modules/geoip/private-ip";

describe("GeoIP HTTP resolver", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "fc00::1",
    "fe80::1"
  ])("does not treat %s as a public IP", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it("resolves and normalizes a public IP location", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          countryCode: "cn",
          region: " 广东省 "
        }),
        { status: 200 }
      )
    );
    const resolver = new HttpGeoIpResolver(
      {
        url: "https://geo.example.test/lookup/{ip}",
        token: "secret-token",
        timeoutMs: 2_000
      },
      fetcher
    );

    await expect(resolver.resolve("203.0.113.8")).resolves.toEqual({
      countryCode: "CN",
      region: "广东省"
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://geo.example.test/lookup/203.0.113.8",
      expect.objectContaining({
        headers: { authorization: "Bearer secret-token" },
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("returns null for private IPs without calling the provider", async () => {
    const fetcher = vi.fn();
    const resolver = new HttpGeoIpResolver(
      {
        url: "https://geo.example.test/lookup/{ip}",
        timeoutMs: 2_000
      },
      fetcher
    );

    await expect(resolver.resolve("192.168.1.10")).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns null for provider failures and malformed responses", async () => {
    const failed = new HttpGeoIpResolver(
      {
        url: "https://geo.example.test/lookup/{ip}",
        timeoutMs: 2_000
      },
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }))
    );
    const malformed = new HttpGeoIpResolver(
      {
        url: "https://geo.example.test/lookup/{ip}",
        timeoutMs: 2_000
      },
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ countryCode: "CHINA" }), {
          status: 200
        })
      )
    );

    await expect(failed.resolve("203.0.113.8")).resolves.toBeNull();
    await expect(malformed.resolve("203.0.113.8")).resolves.toBeNull();
  });

  it("uses a disabled resolver when no provider URL is configured", async () => {
    const resolver = createGeoIpResolver({
      GEOIP_HTTP_URL: undefined,
      GEOIP_HTTP_TOKEN: undefined,
      GEOIP_HTTP_TIMEOUT_MS: undefined
    });

    await expect(resolver.resolve("203.0.113.8")).resolves.toBeNull();
  });
});
