import { expect, test, vi } from "vitest";
import { createCameraGuidance } from "./cameraGuidance";
import { createObservationArrival } from "./observationArrival";
import type { Controls } from "./controls";
import type { ObservationView } from "../app/observations/types";

test("frame updates retain manual control and recenter uses the latest shot", () => {
  const guide = createCameraGuidance();
  const notify = vi.fn(),
    first = vi.fn(),
    latest = vi.fn();
  const unsubscribe = guide.subscribe(notify);
  guide.configure("katrina", first);
  expect(guide.interrupt()).toBe(true);
  expect(guide.interrupt()).toBe(false);
  guide.configure("katrina", latest);
  expect(guide.following()).toBe(false);
  expect(notify).toHaveBeenCalledOnce();
  guide.recenter();
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledOnce();
  expect(guide.following()).toBe(true);
  guide.interrupt();
  guide.configure("radar:world", first);
  expect(guide.read()).toBe(false);
  guide.configure(null, first);
  expect(guide.interrupt()).toBe(false);
  expect(guide.recenter()).toBe(false);
  unsubscribe();
});

test.each([false, true])(
  "taking control during arrival starts the story without moving the camera (reduced=%s)",
  (reduced) => {
    const guide = createCameraGuidance();
    const arrive = vi.fn(),
      setView = vi.fn();
    const controls = {
      guidance: guide,
      state: () => ({ lon: 0, lat: 0, zoom: 1 }),
      framingReady: () => false,
      setView,
      project: () => null,
    } as unknown as Controls;
    const arrival = createObservationArrival(controls, { clientWidth: 1000 } as HTMLCanvasElement);
    guide.configure("story", () => {});
    arrival.set({ arrive, target: { lon: 90, lat: 30, zoom: 2 } } as unknown as ObservationView);
    guide.interrupt();
    expect(arrival.step(0.016, reduced)).toBe(false);
    expect(arrival.ready()).toBe(true);
    expect(arrive).toHaveBeenCalledWith(0.08, reduced);
    expect(setView).not.toHaveBeenCalled();
    arrival.step(1, reduced);
    expect(arrive).toHaveBeenCalledOnce();
  },
);
