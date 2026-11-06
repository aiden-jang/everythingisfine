import type { FloatDiveView } from "../app/float/floatPlayback";
import { spanDeg } from "../geo/sphere";
import type { Controls } from "./controls";
import { createFloatSurface } from "./floatSurface";

const ZOOM = 1.35;

export function createFloatPresentation(controls: Controls) {
  const surface = createFloatSurface();
  let wanted: FloatDiveView | null = null;
  let showing: FloatDiveView | null = null;
  let returnCamera: ReturnType<Controls["state"]> | null = null;
  let restore = false;
  let landed = 0;
  let arrived = false;
  let reveal = 0;

  return {
    object: surface.object,
    size: surface.size,
    set(view: FloatDiveView | null, returnToGlobe: boolean) {
      if (view === wanted) {
        if (!view) restore = returnToGlobe;
        return;
      }
      wanted?.pause();
      wanted = view;
      restore = returnToGlobe;
      if (view) returnCamera ??= controls.state();
      controls.lockOrbit(!!view || reveal > 0);
    },
    step(dt: number, reduced: boolean) {
      let returning = false;
      if (showing !== wanted || (!wanted && returnCamera)) {
        reveal = reduced ? 0 : Math.max(0, reveal - dt / 0.55);
        if (reveal === 0) {
          showing = wanted;
          landed = 0;
          arrived = false;
          if (showing) {
            const { lon, lat } = showing.profile;
            surface.locate(lon, lat);
            controls.flyTo(lon, lat, ZOOM);
          } else {
            if (restore && returnCamera) {
              controls.flyTo(returnCamera.lon, returnCamera.lat, returnCamera.zoom);
              returning = true;
            }
            returnCamera = null;
            controls.lockOrbit(false);
          }
        }
      }
      if (!showing) {
        surface.draw(0, 0, false, reduced);
        return returning;
      }

      let rising = false;
      if (showing === wanted) {
        const camera = controls.state();
        const { lon, lat } = showing.profile;
        if (
          !arrived &&
          spanDeg(camera.lon, camera.lat, lon, lat) < 0.55 &&
          Math.abs(camera.zoom - ZOOM) < 0.025
        )
          arrived = true;
        if (arrived) landed += dt;
        if (arrived && (reduced || landed >= 0.38)) reveal = reduced ? 1 : Math.min(1, reveal + dt / 1.35);
        if (reveal === 1) rising = showing.step(dt);
      }
      const first = showing.profile.samples[0]!.depth;
      const last = showing.profile.samples.at(-1)!.depth;
      surface.draw(reveal, (first - showing.depth()) / (first - last), showing === wanted, reduced);
      return rising || showing !== wanted || reveal < 1;
    },
  };
}
