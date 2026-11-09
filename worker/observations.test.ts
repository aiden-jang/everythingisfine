import { expect, test, vi } from "vitest";
import { observationUrl, relayObservation } from "./observations";

const now = Date.parse("2026-11-09T18:34:00Z");
function store() {
  const data = new Map<string, Response>();
  const key = (request: RequestInfo | URL) => (request instanceof Request ? request.url : String(request));
  return {
    match: vi.fn(async (request: RequestInfo | URL) => data.get(key(request))?.clone()),
    put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
      data.set(key(request), response);
    }),
  };
}
const request = (path: string, method = "GET") =>
  new Request(`https://example.test/api/observations/${path}`, { method });
const netcdf = () => new Response(new Uint8Array([67, 68, 70, 1, 0, 0, 0, 0]));

test("observation routes cannot select an arbitrary host, range, method or query", async () => {
  const cache = store(),
    fetcher = vi.fn(async (_url: string, _init: RequestInit) => netcdf());
  for (const [path, method, status] of [
    ["river?url=https://example.org", "GET", 404],
    ["other", "GET", 404],
    ["reef", "POST", 405],
  ] as const)
    expect((await relayObservation(request(path, method), cache, fetcher, now)).status).toBe(status);
  expect(fetcher).not.toHaveBeenCalled();
  const river = new URL(observationUrl("river", now));
  expect(river.hostname).toBe("thredds.ucar.edu");
  expect(river.searchParams.get("time_start")).toBe("2026-11-09T12:00:00.000Z");
  expect(river.searchParams.get("time_end")).toBe("2026-11-10T12:00:00.000Z");
  expect(decodeURIComponent(observationUrl("reef", now))).toContain(
    "[last-49:7:last][(30):2:(18)][(-90):2:(-60)]",
  );
});

test("concurrent readers share one fetch, bodies remain readable and the next hour refreshes", async () => {
  const cache = store(),
    fetcher = vi.fn(async (_url: string, _init: RequestInit) => netcdf());
  const responses = await Promise.all(
    [1, 2, 3].map(() => relayObservation(request("river"), cache, fetcher, now)),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  for (const response of responses) expect((await response.arrayBuffer()).byteLength).toBe(8);
  expect((await relayObservation(request("river"), cache, fetcher, now)).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await relayObservation(request("river"), cache, fetcher, now + 3600000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
});

test("provider errors, HTML and oversized streams become short-lived explicit failures", async () => {
  for (const upstream of [
    new Response("offline", { status: 503 }),
    new Response("<html>error</html>"),
    new Response(new Uint8Array(4_000_001)),
  ]) {
    const cache = store(),
      fetcher = vi.fn(async () => upstream);
    const result = await relayObservation(request("reef"), cache, fetcher, now);
    expect(result.status).toBe(503);
    expect(result.headers.get("Cache-Control")).toBe("public, max-age=30");
    await relayObservation(request("reef"), cache, fetcher, now);
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});

test("published temperature CSV is separate from the binary heat field", async () => {
  const csv = "time,latitude,longitude,analysed_sst\nUTC,degrees_north,degrees_east,degree_C\n";
  const result = await relayObservation(
    request("reef-temperature"),
    store(),
    async () => new Response(csv),
    now,
  );
  expect(result.headers.get("Content-Type")).toBe("text/csv");
  expect(await result.text()).toBe(csv);
});
