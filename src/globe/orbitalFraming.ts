import { Vector3, type PerspectiveCamera } from "three";
import type { ObservationFrame } from "../app/observations/types";

export function createOrbitalFraming() {
  let goal: ObservationFrame["orbit"];
  let amount = 0;
  let distance = 0;
  const focus = new Vector3();
  const target = new Vector3();
  let dirty = false;
  return {
    set(orbit: ObservationFrame["orbit"]) {
      if (orbit && !goal && amount === 0) {
        focus.fromArray(orbit.focus);
        distance = orbit.distance;
      }
      goal = orbit;
      dirty = true;
    },
    step(dt: number, reduced: boolean) {
      const targetAmount = goal ? 1 : 0;
      const gain = reduced ? 1 : -Math.expm1(-7 * dt);
      amount += (targetAmount - amount) * gain;
      if (Math.abs(targetAmount - amount) < 0.001) amount = targetAmount;
      let moving = amount !== targetAmount;
      if (goal) {
        target.fromArray(goal.focus);
        moving ||= focus.distanceTo(target) + Math.abs(distance - goal.distance) > 0.001;
        focus.lerp(target, gain);
        distance += (goal.distance - distance) * gain;
      }
      return moving;
    },
    apply(camera: PerspectiveCamera, morph: number, reset: () => void) {
      if (!dirty && amount === 0) return;
      reset();
      if (amount === 0 || morph === 1) {
        camera.far = 100;
        camera.updateProjectionMatrix();
        dirty = amount > 0;
        return;
      }
      const blend = amount * (1 - morph);
      const orbit = camera.position.clone().normalize().multiplyScalar(distance).add(focus);
      camera.position.lerp(orbit, blend);
      target.copy(focus).multiplyScalar(blend);
      camera.lookAt(target);
      camera.far = blend > 0 ? 2000 : 100;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      dirty = amount > 0;
    },
  };
}
