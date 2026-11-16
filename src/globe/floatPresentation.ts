import type { FloatDiveView } from "../app/float/floatPlayback";
import { spanDeg } from "../geo/sphere";
import type { Controls } from "./controls";
import { createFloatSurface } from "./floatSurface";
import { placeFloatReading } from "./floatPlacement";

const ZOOM = 1.35;

export function createFloatPresentation(controls: Controls, canvas: HTMLCanvasElement) {
  const surface = createFloatSurface();
  let wanted: FloatDiveView | null = null;
  let showing: FloatDiveView | null = null;
  let returnCamera: ReturnType<Controls["state"]> | null = null;
  let restore = false;
  let landed = 0;
  let arrived = false;
  let readyToPlay = false;
  let inspection = 0;
  let reveal = 0;

  return {
    object: surface.object,
    size() {
      const box = canvas.getBoundingClientRect();
      const deck = canvas.closest(".zones")?.querySelector(".float-transport")?.getBoundingClientRect();
      const clearance =
        deck && box.height > 0
          ? Math.max(0.1, Math.min(0.72, (box.bottom - deck.top + 16) / box.height))
          : 0.1;
      const point = surface.size(canvas.clientWidth, canvas.clientHeight, clearance);
      placeFloatReading(canvas, point.x, point.y, reveal > 0.95);
    },
    set(view: FloatDiveView | null, returnToGlobe: boolean) {
      if (view === wanted) {
        if (!view) restore = returnToGlobe;
        return;
      }
      wanted?.pause();
      wanted = view;
      restore = returnToGlobe;
      if (view || !returnToGlobe) {
        reveal = inspection = 0;
        surface.draw(0, 0, 0, false);
      }
      if (view) returnCamera ??= controls.state();
    },
    step(dt: number, reduced: boolean) {
      let returning = false;
      if (showing !== wanted || (!wanted && returnCamera)) {
        reveal = reduced ? 0 : Math.max(0, reveal - dt / 0.55);
        if (reveal === 0) {
          showing = wanted;
          landed = 0;
          arrived = readyToPlay = false;
          if (showing) {
            const { lon, lat } = showing.profile;
            if (controls.guidance.following()) controls.flyTo(lon, lat, ZOOM);
          } else {
            if (restore && returnCamera) {
              controls.flyTo(returnCamera.lon, returnCamera.lat, returnCamera.zoom);
              returning = true;
            }
            returnCamera = null;
          }
        }
      }
      if (!showing) {
        surface.draw(0, 0, 0, reduced);
        return returning;
      }

      let rising = false;
      if (showing === wanted) {
        const camera = controls.state();
        const { lon, lat } = showing.profile;
        if (
          !arrived &&
          (!controls.guidance.following() ||
            (spanDeg(camera.lon, camera.lat, lon, lat) < 0.55 && Math.abs(camera.zoom - ZOOM) < 0.025))
        )
          arrived = true;
        if (arrived) landed += dt;
        if (!controls.guidance.following()) reveal = reduced ? 0 : Math.max(0, reveal - dt / 0.4);
        else if (showing.read().stage === "locate") reveal = reduced ? 0 : Math.max(0, reveal - dt / 0.55);
        else if (arrived && (reduced || landed >= 0.38))
          reveal = reduced ? 1 : Math.min(1, reveal + dt / 1.35);
        if (reveal === 1 || !controls.guidance.following()) readyToPlay = true;
        if (readyToPlay && showing.read().stage !== "locate") rising = showing.step(dt);
      }
      const first = showing.profile.samples[0]!.depth;
      const last = showing.profile.samples.at(-1)!.depth;
      const inspect = showing.read().inspecting ? 1 : 0;
      inspection = reduced ? inspect : inspection + (inspect - inspection) * -Math.expm1(-9 * dt);
      if (Math.abs(inspection - inspect) < 0.001) inspection = inspect;
      surface.draw(reveal, (first - showing.depth()) / (first - last), inspection, reduced);
      const visible = controls.guidance.following() && showing.read().stage !== "locate" ? 1 : 0;
      return rising || showing !== wanted || reveal !== visible || inspection !== inspect;
    },
  };
}
