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
