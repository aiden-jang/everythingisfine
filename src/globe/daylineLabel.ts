import type { Vector3 } from "three";
import { smallCircle } from "../geo/antipode";
import { RADIUS_NIGHT } from "../geo/land";
import { DEG } from "../geo/sphere";
import type { Controls } from "./controlsTypes";
import { placeSceneCue, sceneCueBounds } from "./sceneCueBounds";

export function createDaylineLabel(canvas: HTMLCanvasElement, controls: Controls, sun: Vector3) {
  const lastSun = sun.clone();
  let samples: ReturnType<typeof smallCircle> = [];
  let chosen = -1;
  return (reveal: number) => {
    const label = canvas.closest(".zones")?.querySelector<HTMLElement>("[data-dayline-label]");
    if (!label) return;
    if (reveal < 0.66 || !sun.lengthSq()) {
      chosen = -1;
      label.removeAttribute("data-visible");
      return;
    }
    if (!samples.length || !sun.equals(lastSun)) {
      lastSun.copy(sun);
      const lat = Math.asin(sun.y) / DEG;
      const lon = Math.atan2(sun.x, sun.z) / DEG;
      samples = smallCircle(lon, lat, 90, 72).slice(0, -1);
    }
    const box = canvas.getBoundingClientRect();
    const bounds = sceneCueBounds(canvas, box, !!label.closest("[data-landing]"));
    const at = (index: number) => {
      const { lon, lat } = samples[index]!;
      // Follow the part of the boundary the shader has already traced.
      if (reveal * 1.13 - (0.5 - Math.sin(lat * DEG) * 0.5) < 0.12) return null;
      const point = controls.project(lon, lat, RADIUS_NIGHT, box);
      return point && bounds.fits(point, 65, 30, 9) ? point : null;
    };
    let point = chosen < 0 ? null : at(chosen);
    if (!point) {
      chosen = -1;
      let best = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const candidate = at(i);
        if (!candidate) continue;
        const distance = Math.hypot(candidate.x - bounds.centre.x, candidate.y - bounds.centre.y);
        if (distance >= best) continue;
        best = distance;
        point = candidate;
        chosen = i;
      }
    }
    placeSceneCue(label, point);
  };
}
