import { afterEach, expect, test, vi } from "vitest";
import { coarsePosition, mayLocateInitially } from "./position";
import { locationAttempt } from "./attempt";
import { requestApproximateLocation } from "./approximate";
import { requestDeviceLocation } from "./device";
import type { Permalink } from "../permalink";

afterEach(() => vi.useRealTimers());

test("only bounded numeric coordinates are accepted and precision is discarded immediately", () => {
  expect(coarsePosition({ lon: -73.9857, lat: 40.7484 })).toEqual({ lon: -74, lat: 40.7 });
  expect(coarsePosition({ lon: 0, lat: 0 })).toEqual({ lon: 0, lat: 0 });
  for (const input of [
    null,
    {},
    { lon: "0", lat: 0 },
    { lon: NaN, lat: 0 },
    { lon: 0, lat: Infinity },
    { lon: 180.001, lat: 0 },
    { lon: 0, lat: -90.001 },
  ])
    expect(coarsePosition(input)).toBeNull();
});

test("every shared geographic or story intent takes precedence over automatic location", () => {
  expect(mayLocateInitially({})).toBe(true);
  expect(mayLocateInitially({ minMagnitude: 3, event: null, cursor: null })).toBe(true);
  const links: Partial<Permalink>[] = [
    { lon: 0 },
    { lat: 0 },
    { zoom: 1 },
    { story: { id: "float", map: false } },
    { scene: "live" },
    { event: "usgs:event" },
    { mark: "fire:event" },
    { day: "2026-01-01" },
    { catalogue: "all" },
    { section: { fromLon: 0, fromLat: 0, toLon: 1, toLat: 1 } },
    { cursor: 0 },
  ];
  for (const link of links) expect(mayLocateInitially(link)).toBe(false);
});

test("input and navigation permanently invalidate a pending attempt and remove its listeners", () => {
  for (const event of [
    "pointerdown",
    "wheel",
    "keydown",
    "click",
    "popstate",
    "hashchange",
    "pagehide",
    "scene-annotation",
  ]) {
    const target = new EventTarget();
    const interrupted = vi.fn();
    const attempt = locationAttempt(target, interrupted);
    target.dispatchEvent(new Event(event));
    expect(attempt.finish()).toBe(false);
    target.dispatchEvent(new Event(event));
    expect(interrupted).toHaveBeenCalledOnce();
  }
  const target = new EventTarget();
  const interrupted = vi.fn();
  const attempt = locationAttempt(target, interrupted);
  expect(attempt.finish()).toBe(true);
  target.dispatchEvent(new Event("click"));
  expect(interrupted).not.toHaveBeenCalled();
});

test("automatic location requests only the fixed private route and delivers a coarse result once", async () => {
  const apply = vi.fn();
  const fetcher = vi.fn(async () => Response.json({ location: { lon: 151.2093, lat: -33.8688 } }));
  const stop = requestApproximateLocation(apply, new EventTarget(), fetcher);
  await vi.waitFor(() => expect(apply).toHaveBeenCalledWith({ lon: 151.2, lat: -33.9 }));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/location",
    expect.objectContaining({
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      redirect: "error",
      signal: expect.any(AbortSignal),
    }),
  );
  expect(apply).toHaveBeenCalledOnce();
  stop();
});

test("a response that ignores abort cannot override interaction, timeout, or unmount", async () => {
  vi.useFakeTimers();
  for (const reason of ["interaction", "timeout", "unmount"]) {
    const target = new EventTarget();
    const apply = vi.fn();
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const stop = requestApproximateLocation(apply, target, fetcher);
    await Promise.resolve();
    if (reason === "interaction") target.dispatchEvent(new Event("wheel"));
    else if (reason === "timeout") await vi.advanceTimersByTimeAsync(3_000);
    else stop();
    resolve(Response.json({ location: { lon: 151.2, lat: -33.9 } }));
    await vi.runAllTimersAsync();
    expect(apply).not.toHaveBeenCalled();
    stop();
  }
});

test("unavailable, malformed and blocked automatic requests leave the fallback untouched", async () => {
  vi.useFakeTimers();
  for (const fetcher of [
    async () => Response.json({ location: null }),
    async () => Response.json({ location: { lon: "1", lat: 2 } }),
    async () => new Response("offline", { status: 503 }),
    () => {
      throw new Error("Blocked");
    },
  ]) {
    const apply = vi.fn();
    const stop = requestApproximateLocation(apply, new EventTarget(), fetcher);
    await vi.runAllTimersAsync();
    expect(apply).not.toHaveBeenCalled();
    stop();
  }
});

function device() {
  let success!: PositionCallback;
  let failure!: PositionErrorCallback;
  const getCurrentPosition = vi.fn((accept: PositionCallback, reject?: PositionErrorCallback | null) => {
    success = accept;
    failure = reject!;
  });
  return {
    geolocation: { getCurrentPosition },
    success: () => success({ coords: { longitude: -73.9857, latitude: 40.7484 } } as GeolocationPosition),
    fail: (code: number) => failure({ code } as GeolocationPositionError),
  };
}

test("explicit device lookup asks for low accuracy, rounds before delivery and reports denial", () => {
  const geo = device();
  const apply = vi.fn();
  const status = vi.fn();
  const stop = requestDeviceLocation(apply, status, new EventTarget(), geo.geolocation);
  expect(geo.geolocation.getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    {
      enableHighAccuracy: false,
      timeout: 8_000,
      maximumAge: 0,
    },
  );
  geo.success();
  expect(apply).toHaveBeenCalledWith({ lon: -74, lat: 40.7 });
  expect(status).toHaveBeenLastCalledWith("Showing your approximate position.");
  stop();
  const denied = device();
  const cancel = requestDeviceLocation(apply, status, new EventTarget(), denied.geolocation);
  denied.fail(1);
  expect(status).toHaveBeenLastCalledWith("Location permission was denied. You can still choose a city.");
  expect(apply).toHaveBeenCalledOnce();
  cancel();
});

test("late device results cannot move the globe after interaction, timeout, or unmount", async () => {
  vi.useFakeTimers();
  for (const reason of ["interaction", "timeout", "unmount"]) {
    const target = new EventTarget();
    const geo = device();
    const apply = vi.fn();
    const status = vi.fn();
    const stop = requestDeviceLocation(apply, status, target, geo.geolocation);
    if (reason === "interaction") target.dispatchEvent(new Event("pointerdown"));
    else if (reason === "timeout") await vi.advanceTimersByTimeAsync(8_000);
    else stop();
    const messages = status.mock.calls.length;
    geo.success();
    geo.fail(2);
    expect(apply).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledTimes(messages);
    stop();
  }
});
