import { Vector3, type PerspectiveCamera } from "three";
import { ORBIT_FLOOR } from "./orbitDistance";
import { DEG } from "../geo/sphere";
import type { Hemisphere } from "../sources/auroraRoute";

const SHOT_SECONDS = 3.6;
const ease = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function createAuroraFlight(camera: PerspectiveCamera) {
  const right = new Vector3();
  let hemisphere: Hemisphere = 1;
  let elapsed = SHOT_SECONDS;
  let skim = 0;
  let from = 0;
  let active = false;
  let moving = false;
  return {
    set(next: Hemisphere | null): void {
      active = next !== null;
      if (next === null) {
        moving = false;
        return;
      }
      from = skim;
      hemisphere = next;
      elapsed = 0;
      moving = true;
    },
    interrupt(): void {
      elapsed = SHOT_SECONDS;
      moving = false;
    },
    ready: (): boolean => !moving && skim === 0,
    sweep: (): number => (active ? ease((elapsed - 0.48) / 2.25) : 0),
    step(dt: number, reduced: boolean): boolean {
      if (reduced) {
        elapsed = SHOT_SECONDS;
        moving = false;
        skim = 0;
        return false;
      }
      if (moving) {
        elapsed = Math.min(SHOT_SECONDS, elapsed + dt);
        const approach = ease((elapsed - 0.28) / 0.88);
        skim = (from + (hemisphere - from) * approach) * (1 - ease((elapsed - 1.55) / 2.05));
        moving = elapsed < SHOT_SECONDS;
      } else {
        skim = Math.sign(skim) * Math.max(0, Math.abs(skim) - dt * 2.5);
      }
      return moving || skim !== 0;
    },
    apply(): void {
      if (skim === 0) return;
      const orbit = 15 * DEG * skim;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.applyAxisAngle(right, orbit);
      camera.position.setLength(
        Math.max(ORBIT_FLOOR, camera.position.length() * (1 - 0.23 * Math.abs(skim))),
      );
      camera.rotateX(orbit + 13 * DEG * skim);
      camera.rotateZ(7 * DEG * skim);
    },
  };
}
