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
    const button = label.hasAttribute("data-nightfall");
    const box = canvas.getBoundingClientRect();
    const bounds = sceneCueBounds(canvas, box, !!label.closest("[data-landing]"));
    const fallback = { x: bounds.centre.x, y: bounds.bottom - 6 };
    const idle = () => {
      chosen = -1;
      label.removeAttribute("data-on-boundary");
      label.removeAttribute("data-position");
      placeSceneCue(label, button && bounds.fits(fallback, 75, 52, 0) ? fallback : null);
    };
    if (reveal < 0.66 || !sun.lengthSq()) return idle();
    if (!samples.length || !sun.equals(lastSun)) {
      lastSun.copy(sun);
      const lat = Math.asin(sun.y) / DEG;
      const lon = Math.atan2(sun.x, sun.z) / DEG;
      samples = smallCircle(lon, lat, 90, 72).slice(0, -1);
    }
    const at = (index: number) => {
      const { lon, lat } = samples[index]!;
      // Follow the part of the boundary the shader has already traced.
      if (reveal * 1.13 - (0.5 - Math.sin(lat * DEG) * 0.5) < 0.12) return null;
      const point = controls.project(lon, lat, RADIUS_NIGHT, box);
      return point && bounds.fits(point, button ? 75 : 65, button ? 54 : 30, 9) ? point : null;
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
    if (!point) return idle();
    label.setAttribute("data-on-boundary", "");
    if (button) {
      const sample = samples[chosen]!;
      label.dataset["position"] = `${sample.lon},${sample.lat}`;
    }
    placeSceneCue(label, point);
  };
}
