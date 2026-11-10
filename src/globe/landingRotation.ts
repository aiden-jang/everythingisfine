import type { Controls } from "./controls";

type Camera = Pick<Controls, "state" | "setView">;

export function createLandingRotation() {
  const pace = 2.4;
  let speed = 0;
  return (camera: Camera, dt: number, enabled: boolean, busy: boolean): boolean => {
    if (!enabled || busy) {
      speed = 0;
      return false;
    }
    const elapsed = Math.max(0, Math.min(dt, 0.1));
    // A newly awakened frame can share the previous timestamp; keep the next frame queued.
    if (elapsed === 0) return true;
    const gain = -Math.expm1(-2 * elapsed);
    const travel = pace * elapsed + ((speed - pace) * gain) / 2;
    speed += (pace - speed) * gain;
    const pose = camera.state();
    camera.setView({ ...pose, lon: pose.lon + travel });
    return true;
  };
}
