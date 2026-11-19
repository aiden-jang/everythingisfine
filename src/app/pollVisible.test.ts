import { afterEach, expect, it, vi } from "vitest";
import { pollVisible } from "./pollVisible";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("sleeps while hidden and refreshes once when overdue without overlapping", async () => {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), { hidden: true });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  let resolve: (() => void) | undefined;
  const load = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const stop = pollVisible(load, 100);
  expect(load).not.toHaveBeenCalled();
  doc.hidden = false;
  doc.dispatchEvent(new Event("visibilitychange"));
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(load).toHaveBeenCalledTimes(1);
  resolve!();
  await Promise.resolve();
  doc.hidden = true;
  await vi.advanceTimersByTimeAsync(500);
  expect(load).toHaveBeenCalledTimes(1);
  doc.hidden = false;
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(load).toHaveBeenCalledTimes(2);
  stop();
  resolve!();
  await vi.advanceTimersByTimeAsync(500);
  expect(load).toHaveBeenCalledTimes(2);
});

it("cancels the leaving page's request and starts one fresh request on return", async () => {
  vi.useFakeTimers();
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const win = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  const pending: { signal: AbortSignal; resolve: () => void }[] = [];
  const stop = pollVisible(
    (signal) => new Promise<void>((resolve) => pending.push({ signal, resolve })),
    100,
  );

  win.dispatchEvent(new Event("pagehide"));
  expect(pending[0]?.signal.aborted).toBe(true);
  win.dispatchEvent(new Event("online"));
  doc.dispatchEvent(new Event("visibilitychange"));
  expect(pending).toHaveLength(1);

  win.dispatchEvent(new Event("pageshow"));
  win.dispatchEvent(new Event("online"));
  expect(pending).toHaveLength(2);
  pending[0]?.resolve();
  await vi.advanceTimersByTimeAsync(500);
  expect(pending).toHaveLength(2);
  stop();
  expect(pending[1]?.signal.aborted).toBe(true);
});
