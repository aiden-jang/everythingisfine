import { expect, test, vi } from "vitest";
import { createObservationPicking } from "./observationPicking";
import type { Controls } from "./controls";
import type { ObservationView } from "../app/observations/types";

test("map picking waits for a tap and leaves drags, pinches and canceled gestures alone", () => {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const point = { lon: 142, lat: 11 };
  const controls = { morph: () => 1, pick: () => point } as unknown as Controls;
  const pick = vi.fn();
  const picking = createObservationPicking(canvas, controls);
  picking.set({ onPick: pick } as unknown as ObservationView);
  function send(type: string, id: number, x: number) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: id,
      clientX: x,
      clientY: 100,
      button: 0,
    });
    canvas.dispatchEvent(event);
    return event;
  }
  expect(send("pointerdown", 1, 100).defaultPrevented).toBe(false);
  expect(pick).not.toHaveBeenCalled();
  send("pointermove", 1, 130);
  send("pointerup", 1, 100);
  send("pointerdown", 1, 100);
  send("pointerdown", 2, 150);
  send("pointerup", 1, 100);
  send("pointerup", 2, 150);
  send("pointerdown", 1, 100);
  send("pointercancel", 1, 100);
  send("pointerup", 1, 100);
  expect(pick).not.toHaveBeenCalled();
  send("pointerdown", 1, 100);
  send("pointerup", 1, 101);
  expect(pick).toHaveBeenCalledExactlyOnceWith(point);
  picking.dispose();
  send("pointerdown", 1, 100);
  send("pointerup", 1, 100);
  expect(pick).toHaveBeenCalledOnce();
});

test("globe inspection is opt-in and releases its handler when the view changes", () => {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const point = { lon: -74, lat: 40.7 };
  const controls = { morph: () => 0, pick: () => point } as unknown as Controls;
  const picking = createObservationPicking(canvas, controls),
    pick = vi.fn();
  const tap = () => {
    for (const type of ["pointerdown", "pointerup"])
      canvas.dispatchEvent(
        Object.assign(new Event(type), {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
        }),
      );
  };
  picking.set({ onPick: pick } as unknown as ObservationView);
  tap();
  expect(pick).not.toHaveBeenCalled();
  picking.set({ onPick: pick, pickOnGlobe: true } as unknown as ObservationView);
  tap();
  expect(pick).toHaveBeenCalledExactlyOnceWith(point);
  picking.set(null);
  tap();
  expect(pick).toHaveBeenCalledOnce();
  picking.dispose();
});

test("recorded marks take the nearest visible point and yield during dragging or projection travel", () => {
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({}),
  }) as unknown as HTMLCanvasElement;
  let morph = 0;
  const controls = {
    morph: () => morph,
    project: (lon: number) => (lon > 0 ? { x: lon, y: 100 } : null),
  } as unknown as Controls;
  const picking = createObservationPicking(canvas, controls);
  const select = vi.fn();
  picking.set({
    pickMarks: { points: [100, 112, -1].map((lon) => ({ lon, lat: 0 })), select },
  } as unknown as ObservationView);
  const send = (type: string, x: number) =>
    canvas.dispatchEvent(
      Object.assign(new Event(type), {
        pointerId: 1,
        clientX: x,
        clientY: 100,
        button: 0,
        pointerType: "touch",
      }),
    );
  const tap = (x: number) => {
    send("pointerdown", x);
    send("pointerup", x);
  };
  tap(110);
  expect(select).toHaveBeenCalledExactlyOnceWith(1);
  send("pointerdown", 112);
  send("pointermove", 125);
  send("pointerup", 125);
  morph = 0.5;
  tap(112);
  tap(0);
  expect(select).toHaveBeenCalledOnce();
  morph = 1;
  tap(100);
  expect(select).toHaveBeenLastCalledWith(0);
  picking.dispose();
});
