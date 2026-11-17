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
  vi.stubGlobal("window", globalThis);
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
