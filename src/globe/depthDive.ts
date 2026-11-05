import { Vector3, type PerspectiveCamera } from "three";
import { DEG } from "../geo/sphere";

const RIM_ANGLE = 19 * DEG;
const LOOK_DEPTH = 0.08;

export function createDepthDive(camera: PerspectiveCamera) {
  const axis = new Vector3();
  let progress = 0;
  let destination = 0;
  let held = false;
  const ready = (): boolean => held || progress === destination;

  return {
    set(on: boolean): void {
      destination = on ? 1 : 0;
      held = false;
    },
    wanted: (): boolean => destination === 1,
    ready,
    interrupt(): void {
      if (destination === 1) held = true;
    },
    clear(): void {
      progress = destination = 0;
      held = false;
    },
    step(dt: number, reduced: boolean, arrived: boolean): boolean {
      if (reduced) {
        progress = destination;
      } else if (!held) {
        if (destination === 0) progress = Math.max(0, progress - dt / 0.75);
        else if (arrived) progress = Math.min(1, progress + dt / 0.95);
      }
      return !ready();
    },
    apply(): void {
      if (progress === 0) return;
      const ease = progress * progress * (3 - 2 * progress);
      const orbit = RIM_ANGLE * ease;
      const radius = (1 - LOOK_DEPTH) * ease;
      const inwardPitch = Math.atan2(
        radius * Math.sin(orbit),
        camera.position.length() - radius * Math.cos(orbit),
      );
      // Keep the same right axis as the eye crosses a pole, where lookAt could flip its roll.
      axis.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.applyAxisAngle(axis, orbit);
      camera.rotateX(orbit + inwardPitch);
    },
  };
}
