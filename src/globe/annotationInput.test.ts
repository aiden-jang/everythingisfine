import { expect, test, vi } from "vitest";
import { attachAnnotations } from "./annotationInput";
import { createCameraGuidance } from "./cameraGuidance";
import type { Controls } from "./controls";

test("annotation updates wake the shared scene without moving it until Locate is requested", () => {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const guidance = createCameraGuidance(),
    flyTo = vi.fn(),
    restore = vi.fn(),
    wake = vi.fn();
  guidance.configure("story", restore);
  const controls = { guidance, flyTo, state: () => ({ zoom: 2 }) } as unknown as Controls;
  const detach = attachAnnotations(canvas, controls, wake);
  const send = (detail?: unknown) => canvas.dispatchEvent(new CustomEvent("scene-annotation", { detail }));
  send();
  expect(wake).toHaveBeenCalledOnce();
  expect(flyTo).not.toHaveBeenCalled();
  expect(guidance.following()).toBe(true);
  send({ lon: 141, lat: 38 });
  expect(flyTo).toHaveBeenCalledExactlyOnceWith(141, 38, 2);
  expect(guidance.following()).toBe(false);
  send({ camera: "resume" });
  expect(restore).toHaveBeenCalledOnce();
  expect(guidance.following()).toBe(true);
  send({ camera: "hold" });
  expect(guidance.following()).toBe(false);
  detach();
  wake.mockClear();
  send();
  expect(wake).not.toHaveBeenCalled();
});

test("camera reset uses the visit's home area but preserves a story's own framing", () => {
  const canvas = new EventTarget() as HTMLCanvasElement;
  const guidance = createCameraGuidance();
  const flyTo = vi.fn(),
    restore = vi.fn();
  const detach = attachAnnotations(canvas, { guidance, flyTo } as unknown as Controls, vi.fn());
  const reset = () =>
    canvas.dispatchEvent(
      new CustomEvent("scene-annotation", {
        detail: { camera: "reset", home: { lon: 151.2, lat: -33.9, zoom: 1 } },
      }),
    );
  reset();
  expect(flyTo).toHaveBeenCalledExactlyOnceWith(151.2, -33.9, 1);
  guidance.configure("story", restore);
  guidance.interrupt();
  reset();
  expect(restore).toHaveBeenCalledOnce();
  expect(flyTo).toHaveBeenCalledOnce();
  detach();
});
