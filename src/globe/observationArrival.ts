import type { ObservationView } from "../app/observations/types";
import { spanDeg } from "../geo/sphere";
import type { Controls } from "./controls";

export function createObservationArrival(controls: Controls, canvas: HTMLCanvasElement) {
  let active: ObservationView | null = null;
  let elapsed = 0;
  let arrived = false;
  return {
    set(view: ObservationView | null) {
      const next = view?.arrive ? view : null;
      const returning = active !== null && next === null;
      if (next?.arrive !== active?.arrive || next?.target !== active?.target) {
        if (!!next !== !!active) controls.lockOrbit(!!next);
        elapsed = 0;
        arrived = false;
      }
      active = next;
      return returning;
    },
    ready: () => arrived,
    step(dt: number, reduced: boolean) {
      if (!active?.arrive || arrived) return false;
      elapsed += dt;
      const { lon, lat, zoom } = active.target;
      const camera = controls.state();
      const close = spanDeg(camera.lon, camera.lat, lon, lat) < 0.2 && Math.abs(camera.zoom - zoom) < 0.018;
      if (!reduced && elapsed < 5 && (!close || !controls.framingReady())) return true;
      if (reduced) controls.setView(active.target);
      const west = controls.project(lon - 0.9, lat);
      const east = controls.project(lon + 0.9, lat);
      const scale = west && east ? Math.abs(east.x - west.x) / Math.max(1, 0.94 * canvas.clientWidth) : 0.08;
      arrived = true;
      active.arrive(Math.max(0.035, Math.min(0.3, scale)), reduced);
      return false;
    },
  };
}
