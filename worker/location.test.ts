import { expect, test, vi } from "vitest";
import type { Connect, ViteDevServer } from "vite";
import { approximateLocation } from "./location";
import worker from "./index";
import { observationDevelopment } from "./development";

function request(cf?: Record<string, unknown>, suffix = "", method = "GET") {
  return Object.assign(new Request(`https://example.test/api/location${suffix}`, { method }), { cf });
}

test("only rounded edge coordinates leave the location route", async () => {
  const response = approximateLocation(
    request({ longitude: "-73.9857", latitude: "40.7484", city: "New York", clientIP: "192.0.2.1" }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ location: { lon: -74, lat: 40.7 } });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Content-Type")).toBe("application/json");
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  expect(response.headers.has("Set-Cookie")).toBe(false);
  expect(await approximateLocation(request({ longitude: 180, latitude: -90 })).json()).toEqual({
    location: { lon: 180, lat: -90 },
  });
});

test("missing or invalid metadata returns null without coercing empty values or using headers", async () => {
  for (const cf of [
    undefined,
    {},
    { longitude: "0" },
    { longitude: null, latitude: 0 },
    { longitude: "", latitude: 0 },
    { longitude: " ", latitude: 0 },
    { longitude: true, latitude: 0 },
    { longitude: "0x10", latitude: 0 },
    { longitude: "Infinity", latitude: 0 },
    { longitude: NaN, latitude: 0 },
    { longitude: Infinity, latitude: 0 },
    { longitude: 180.01, latitude: 0 },
    { longitude: 0, latitude: -90.01 },
    { longitude: 0, latitude: "bad" },
  ]) {
    const input = request(cf);
    input.headers.set("CF-IPLatitude", "40.7");
    input.headers.set("CF-IPLongitude", "-74.0");
    expect(await approximateLocation(input).json()).toEqual({ location: null });
  }
  expect(await approximateLocation(request({ longitude: 0, latitude: 0 })).json()).toEqual({
    location: { lon: 0, lat: 0 },
  });
});

test("queries and non-GET methods receive explicit uncached responses without location", async () => {
  for (const [suffix, method, status] of [
    ["?city=London", "GET", 400],
    ["?lat=40&lon=-74", "GET", 400],
    ["", "POST", 405],
    ["", "OPTIONS", 405],
    ["", "HEAD", 405],
  ] as const) {
    const response = approximateLocation(request({ longitude: 1, latitude: 2 }, suffix, method));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ location: null });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
    if (status === 405) expect(response.headers.get("Allow")).toBe("GET");
  }
});

test("the worker dispatches only the exact location route and preserves asset fallback", async () => {
  const assets = vi.fn(async () => new Response("asset"));
  const env = { ASSETS: { fetch: assets } };
  const response = await worker.fetch(request({ longitude: 12.34, latitude: 56.78 }), env);
  expect(await response.json()).toEqual({ location: { lon: 12.3, lat: 56.8 } });
  expect(assets).not.toHaveBeenCalled();
  expect((await worker.fetch(request(undefined, "?query=1"), env)).status).toBe(400);
  expect(await (await worker.fetch(request(undefined, "/other"), env)).text()).toBe("asset");
  expect(assets).toHaveBeenCalledTimes(1);
});

test("development and preview return null even when the incoming request has location metadata", async () => {
  const plugin = observationDevelopment();
  for (const install of [plugin.configureServer, plugin.configurePreviewServer]) {
    let middleware: Connect.NextHandleFunction | undefined;
    const server = {
      middlewares: {
        use(handler: Connect.NextHandleFunction) {
          middleware = handler;
        },
      },
    } as unknown as ViteDevServer;
    if (typeof install !== "function") throw new Error("Missing local middleware");
    install.call({} as never, server as never);
    if (!middleware) throw new Error("Missing location handler");
    const handle = middleware;
    for (const [url, method, status] of [
      ["/api/location", "GET", 200],
      ["/api/location?city=London", "GET", 400],
      ["/api/location", "POST", 405],
    ] as const) {
      const writeHead = vi.fn();
      const body = await new Promise<Uint8Array>((resolve, reject) => {
        handle(
          { url, method, cf: { latitude: "40.7", longitude: "-74" } } as never,
          { writeHead, end: resolve } as never,
          reject,
        );
      });
      expect(writeHead).toHaveBeenCalledWith(
        status,
        expect.objectContaining({ "cache-control": "private, no-store" }),
      );
      expect(JSON.parse(new TextDecoder().decode(body))).toEqual({ location: null });
    }
    const next = vi.fn();
    handle({ url: "/api/location/other", method: "GET" } as never, {} as never, next);
    expect(next).toHaveBeenCalledOnce();
  }
});
