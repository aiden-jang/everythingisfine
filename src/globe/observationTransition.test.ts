import { expect, test, vi } from "vitest";
import { newObservationPlace } from "./observationTransition";
import { createObservationArrival } from "./observationArrival";
import type { ObservationView } from "../app/observations/types";
import type { Controls } from "./controls";

const view = (): ObservationView => ({
  kind: "observation",
  cameraKey: "ice",
  frame: { at: 1 },
  image: null,
  target: { lon: 0, lat: 70, zoom: 1.5 },
});
test("equivalent target objects and wrapped longitudes retain the reveal", () => {
  const a = view(),
    b = view();
  expect(newObservationPlace(a, b)).toBe(false);
  b.target.lon = 360;
  expect(newObservationPlace(a, b)).toBe(false);
  b.target.lon = -720;
  expect(newObservationPlace(a, b)).toBe(false);
  b.target.lat = 60;
  expect(newObservationPlace(a, b)).toBe(true);
  expect(newObservationPlace({ ...a, cameraKey: "ozone" }, a)).toBe(true);
});
test("a same-place frame update does not restart an arrived camera", () => {
  const arrive = vi.fn();
  const controls = {
    state: () => ({ lon: 0, lat: 70, zoom: 1.5 }),
    guidance: { following: () => true },
    framingReady: () => true,
    project: () => null,
  } as unknown as Controls;
  const arrival = createObservationArrival(controls, { clientWidth: 1000 } as HTMLCanvasElement);
  arrival.set({ ...view(), arrive });
  arrival.step(1 / 60, false);
  expect(arrive).toHaveBeenCalledTimes(1);
  arrival.set({ ...view(), arrive });
  arrival.step(1 / 60, false);
  expect(arrive).toHaveBeenCalledTimes(1);
  expect(arrival.ready()).toBe(true);
});
