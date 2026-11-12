import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  vi.resetModules();
  const fetch = vi.fn(async () => new Response(new Blob(["radar"], { type: "image/png" })));
  vi.stubGlobal("fetch", fetch);
  const { rainviewerFetch } = await import("./rainviewerFetch");
  return { fetch, load: rainviewerFetch, signal: new AbortController().signal };
}

test("reopening reuses successful tiles while expired catalogues refresh", async () => {
  vi.useFakeTimers();
  const { fetch, load, signal } = await setup();
  const first = await load("tile", signal);
  expect(await load("tile", signal)).toBe(first);
  await load("catalogue", signal, 60_000);
  await vi.advanceTimersByTimeAsync(60_001);
  await load("catalogue", signal, 60_000);
  await load("tile", signal);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("rapid retries stay below the provider limit and pending waits abort on exit", async () => {
  vi.useFakeTimers();
  const { fetch, load, signal } = await setup();
  for (let i = 0; i < 80; i++) await load(`tile-${i}`, signal);
  const controller = new AbortController();
  const pending = load("extra", controller.signal);
  const rejected = expect(pending).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(80);
  controller.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(60_001);
  await load("extra", signal);
  expect(fetch).toHaveBeenCalledTimes(81);
});

test("unsuccessful and invalid responses never enter the cache", async () => {
  const { fetch, load, signal } = await setup();
  fetch.mockResolvedValueOnce(new Response("down", { status: 429 }));
  await expect(load("tile", signal)).rejects.toThrow();
  fetch.mockResolvedValueOnce(new Response("<html/>"));
  await expect(load("tile", signal)).rejects.toThrow();
  await load("tile", signal);
  expect(fetch).toHaveBeenCalledTimes(3);
});
