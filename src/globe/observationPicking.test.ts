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
