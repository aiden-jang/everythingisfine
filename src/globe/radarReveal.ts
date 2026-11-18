import { Vector3 } from "three";
import { DEG, spanDeg, toVec3 } from "../geo/sphere";
import type { RadarReveal } from "../app/radar/radarCamera";
import type { Controls } from "./controlsTypes";

const SWEEP_START = 0.18;
const SWEEP_END = 1.18;
const SETTLE_END = 1.42;
const MAX_ARRIVAL = 1.85;

/** One geographic sweep, independent of the radar frame and projection. */
export function createRadarReveal(controls: Controls, canvas: HTMLCanvasElement) {
  const uniforms = {
    radarSweepSite: { value: new Vector3() },
    radarSweepAxis: { value: new Vector3() },
    radarSweepReach: { value: 1 },
    radarSweepEdge: { value: -1.1 },
    radarSweepAmount: { value: 0 },
  };
  const north = new Vector3();
  let active: RadarReveal | undefined;
  let elapsed = 0;
  let finished = false;
  let bank = 0;

  function finish() {
    finished = true;
    bank = 0;
    uniforms.radarSweepAmount.value = 0;
    active?.finish();
  }

  return {
    uniforms,
    bank: () => bank,
    set(next: RadarReveal | undefined) {
      if (active === next) return;
      if (active && !finished) finish();
      active = next;
      elapsed = 0;
      finished = false;
      if (!next) return;
      const { lon, lat, zoom } = next.target;
      const site = uniforms.radarSweepSite.value.set(...toVec3(lon, lat, 1));
      const axis = uniforms.radarSweepAxis.value.set(Math.cos(lon * DEG), 0, -Math.sin(lon * DEG));
      axis.addScaledVector(north.crossVectors(site, axis), 0.33).normalize();
      controls.flyTo(lon, lat, zoom);
    },
    step(dt: number, reduced: boolean) {
      if (!active || finished) return false;
      const following = controls.guidance.following();
      if (!following || reduced) {
        if (following) controls.setView(active.target);
        finish();
        return false;
      }
      elapsed += dt;
      const { lon, lat, zoom } = active.target;
      const camera = controls.state();
      const near = spanDeg(camera.lon, camera.lat, lon, lat) < 0.2 && Math.abs(camera.zoom - zoom) < 0.025;
      if (elapsed >= MAX_ARRIVAL || (elapsed >= SETTLE_END && near)) {
        finish();
        return false;
      }

      const progress = Math.max(0, Math.min(1, (elapsed - SWEEP_START) / (SWEEP_END - SWEEP_START)));
      const travel = progress * progress * (3 - 2 * progress);
      const radius = controls.degForPx(Math.max(canvas.clientWidth, canvas.clientHeight) * 0.62, zoom);
      uniforms.radarSweepReach.value = Math.sin(Math.max(5, Math.min(74, radius)) * DEG);
      uniforms.radarSweepEdge.value = -1.15 + 2.3 * travel;
      uniforms.radarSweepAmount.value = Math.min(1, elapsed / SWEEP_START) * Math.min(1, 10 * (1 - progress));
      bank = 0.068 * Math.sin(Math.PI * Math.min(1, elapsed / SETTLE_END)) ** 2;
      return true;
    },
  };
}
